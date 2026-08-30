import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { jsonDataBlocksFromHtml, jsonLdBlocksFromHtml, recipeFromJsonLd } from "@/lib/schemaRecipe";
import { adaptCookPilotRecipes, normalizeImportURL } from "@/lib/cookpilot";
import type { ParseResponse, Recipe } from "@/types/recipe";

export const runtime = "nodejs";
/**
 * Long enough to outlast this route's own timeouts.
 *
 * Without it, Vercel terminates the function at the platform default — well
 * before either `AbortSignal.timeout` below can fire. So every careful message
 * under here was unreachable in production: a slow recipe site produced an
 * opaque FUNCTION_INVOCATION_TIMEOUT instead of "That website took too long to
 * respond. Try again, or paste the recipe text instead." Import failure is the
 * most common failure this product has, and its best error text was dead code.
 *
 * The budget is the CookPilot parser (55s) and then, if it found nothing, our
 * own fetch (20s) — so the worst case is a little over 75s and this sits above
 * it. Note that 55s is a long time to ask someone to keep watching a spinner;
 * lowering it is a behaviour change worth making separately, and this at least
 * means the wait now ends in a sentence rather than a platform error.
 */
export const maxDuration = 90;

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

class ParseHttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function errorResponse(error: string, status = 400, parserExhausted = false) {
  return NextResponse.json(
    { success: false, error, ...(parserExhausted ? { parserExhausted: true as const } : {}) } satisfies ParseResponse,
    { status },
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

async function validatePublicHttpUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ParseHttpError("Use a regular website link that starts with http:// or https://.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new ParseHttpError("That URL doesn't look like a public recipe page.");
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new ParseHttpError("That URL doesn't look like a public recipe page.");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address.address))) {
    throw new ParseHttpError("That URL doesn't look like a public recipe page.");
  }
}

async function fetchPublicHtml(url: URL): Promise<Response> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicHttpUrl(currentUrl);

    const response = await fetch(currentUrl, {
      headers: REQUEST_HEADERS,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new ParseHttpError(
          "We couldn't follow that recipe link. Try the original link or paste the recipe text instead.",
          502,
        );
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return response;
  }

  throw new ParseHttpError(
    "That link sent us through too many pages. Try the original link or paste the recipe text instead.",
    508,
  );
}

async function readHtmlWithLimit(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    throw new ParseHttpError("That recipe page is too large to import.", 413);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let html = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new ParseHttpError("That recipe page is too large to import.", 413);
    }
    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

/**
 * What the server-side CookPilot attempt concluded. The distinction that
 * matters is `empty` vs `skipped`: only `empty` means the full parser actually
 * ran and answered "there is no recipe here", which is what lets the client
 * skip re-running it (see `ParseError.parserExhausted`). Anything we couldn't
 * get a real answer out of — not configured for this deployment, an unreadable
 * response body, a status this function doesn't translate — is `skipped`, and
 * the client fallback stays worth trying.
 */
type CookPilotServerOutcome =
  | { kind: "recipes"; recipes: Recipe[] }
  | { kind: "empty" }
  | { kind: "skipped" };

const SKIPPED: CookPilotServerOutcome = { kind: "skipped" };

async function parseWithCookPilotServer(url: string): Promise<CookPilotServerOutcome> {
  const endpoint = process.env.COOKPILOT_RECIPE_PARSER_URL?.trim();
  const secret = process.env.RECIPEPRINTER_PARSER_SECRET?.trim();
  if (!endpoint || !secret) return SKIPPED;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RecipePrinter-Parser-Secret": secret,
    },
    // `multiRecipe` is RecipePrinter's opt-in for roundup pages: CookPilot returns
    // every recipe it finds ({ recipes: [...] }) instead of just the main one.
    body: JSON.stringify({ url, multiRecipe: true }),
    signal: AbortSignal.timeout(55000),
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (response.ok) {
    const recipes = adaptCookPilotRecipes(data, url);
    if (recipes.length > 0) return { kind: "recipes", recipes };
    // An unreadable body isn't the parser answering "no recipe" — we simply
    // never got its answer, so it doesn't count as exhausted.
    if (data === null) return SKIPPED;
    // The parser ran and found nothing. Deliberately NOT a throw: the JSON-LD
    // pass below is a genuinely different reader, and a page whose structured
    // data is fine but whose prose defeats the parser used to be rescued only
    // by the client's duplicate call. Falling through gets that result here,
    // in one round trip instead of two.
    return { kind: "empty" };
  }

  if (response.status === 401 || response.status === 403) {
    throw new ParseHttpError(
      "We couldn't import this link right now. Paste the recipe text or upload screenshots instead.",
      503,
    );
  }
  if (response.status === 429) {
    throw new ParseHttpError(
      "We're handling a lot of recipes right now. Wait a moment and try again.",
      429,
    );
  }
  if (response.status >= 500 || response.status === 504) {
    throw new ParseHttpError(
      "We couldn't read that recipe page right now. Try again, or paste the recipe text instead.",
      response.status,
    );
  }
  return SKIPPED;
}

export async function POST(request: Request) {
  let url: URL;

  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return errorResponse("Paste a recipe link first.");
    }
    url = new URL(normalizeImportURL(body.url));
  } catch {
    return errorResponse("That doesn't look like a valid URL.");
  }

  // Once the full parser has answered "no recipe", it stays answered for the
  // rest of this request — whatever our own direct fetch goes on to hit, asking
  // the client to run that same parser again can only reproduce it.
  let parserExhausted = false;

  try {
    const cookPilot = await parseWithCookPilotServer(url.toString());
    if (cookPilot.kind === "recipes") {
      return NextResponse.json({ success: true, recipes: cookPilot.recipes } satisfies ParseResponse);
    }
    parserExhausted = cookPilot.kind === "empty";

    const response = await fetchPublicHtml(url);

    if (!response.ok) {
      if (response.status === 404) {
        return errorResponse("We couldn't find that page. Check the link and try again.", 404, parserExhausted);
      }
      if ([401, 402, 403, 429].includes(response.status)) {
        return errorResponse(
          "This website wouldn't let us read the recipe. Paste the recipe text or upload screenshots instead.",
          response.status,
          parserExhausted,
        );
      }
      return errorResponse(
        "We couldn't open that recipe page. Try again, or paste the recipe text instead.",
        response.status,
        parserExhausted,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return errorResponse("That URL doesn't look like a recipe page.", 400, parserExhausted);
    }

    const html = await readHtmlWithLimit(response);
    const recipe = [...jsonLdBlocksFromHtml(html), ...jsonDataBlocksFromHtml(html)]
      .map((block) => recipeFromJsonLd(block, response.url || url.toString()))
      .find(Boolean);

    if (!recipe) {
      return errorResponse(
        "We couldn't find a complete recipe on that page. Try another link or paste the recipe text instead.",
        422,
        parserExhausted,
      );
    }

    // The JSON-LD-only fallback picks a single recipe; wrap it as a one-element
    // array so the client sees the same `recipes` shape as the CookPilot path.
    return NextResponse.json({ success: true, recipes: [recipe] } satisfies ParseResponse);
  } catch (err) {
    if (err instanceof ParseHttpError) {
      return errorResponse(err.message, err.status, parserExhausted);
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return errorResponse(
        "That website took too long to respond. Try again, or paste the recipe text instead.",
        504,
        parserExhausted,
      );
    }
    return errorResponse(
      "We couldn't import that recipe. Try again, paste the recipe text, or upload screenshots.",
      500,
      parserExhausted,
    );
  }
}
