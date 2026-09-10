import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { jsonDataBlocksFromHtml, jsonLdBlocksFromHtml, recipeFromJsonLd } from "@/lib/schemaRecipe";
import { adaptCookPilotRecipes, normalizeImportURL } from "@/lib/cookpilot";
import { BLOCKED_REMEDY, searchPageMessage, unwrapRedirectUrl } from "@/lib/importUrl";
import { callerKey, rateLimit } from "@/lib/server/rateLimit";
import { BODY_PREFIX_BYTES, classifyPage, type PageVerdict } from "@/lib/server/botWall";
import type { ImportFailureCode } from "@/lib/analytics";
import type { BotWallVendor, ParseResponse, Recipe } from "@/types/recipe";

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
 * The budget is the CookPilot parser, then our own fetch if it found nothing.
 */
export const maxDuration = 90;

/**
 * Down from 55s.
 *
 * The comment above used to note that 55s is "a long time to ask someone to
 * keep watching a spinner" and that lowering it was a change worth making on
 * its own. This is that change. Measured against the sites that actually wall
 * us, the parser either answers well inside 30s or times out entirely, so the
 * back half of that budget was a cook watching a spinner for an answer that
 * was never coming. The cost is that a site genuinely answering between 30 and
 * 55 seconds now fails, which is what the `cookpilot slow` line below is for;
 * it is a one-constant revert.
 */
const COOKPILOT_TIMEOUT_MS = 30_000;

// A URL import is one paste at a time — there is no bulk-URL surface anywhere in
// the app (lib/parser.ts:172 is the only caller). Thirty in ten minutes is far
// above anything a person does by hand and still bounds the damage: each call
// may spend up to 90s, and behind it sits CookPilot's paid parser reached with
// our shared secret. Unlike /api/cookbook-pdf there is no entitlement check in
// front of this route to remove the anonymous caller, so the limiter is the
// only thing standing between a `for` loop and the parser bill.
const PARSE_LIMIT = 30;
const PARSE_WINDOW_MS = 10 * 60 * 1000;

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
    /** The parser gave a final answer about this URL, so the client's own
        retry — which reaches the same parser — has nothing new to try. */
    public exhausted = false,
  ) {
    super(message);
  }
}

interface ErrorOptions {
  status?: number;
  parserExhausted?: boolean;
  /** Our own verdict, so the client stops inferring one from the status. Left
      unset where we genuinely do not know: the client's status mapping is the
      right answer then, and asserting a guess would be worse than it. */
  failure?: ImportFailureCode;
  botWall?: { vendor: BotWallVendor };
}

function errorResponse(error: string, opts: ErrorOptions = {}) {
  const { status = 400, parserExhausted = false, failure, botWall } = opts;
  return NextResponse.json(
    {
      success: false,
      error,
      ...(parserExhausted ? { parserExhausted: true as const } : {}),
      ...(failure ? { failure } : {}),
      ...(botWall ? { botWall } : {}),
    } satisfies ParseResponse,
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

/**
 */
async function fetchPublicHtml(url: URL): Promise<Response> {
  const headers = REQUEST_HEADERS;
  const timeoutMs = 20_000;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicHttpUrl(currentUrl);

    const response = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
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
 * The opening bytes of a body we do NOT intend to parse, then hang up.
 *
 * Used only where the body was previously thrown away unread: a non-2xx
 * response whose status we used to map straight to copy. Enough to fingerprint
 * a challenge page and no more, because that is the response shape most likely
 * to be hostile. Never throws — a body we cannot read is "" and the classifier
 * says `none`, which is exactly the conservative answer.
 */
async function readBodyPrefix(response: Response): Promise<string> {
  if (!response.body) return "";

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";

    while (received < BODY_PREFIX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    return text + decoder.decode();
  } catch {
    return "";
  }
}

/**
 * What we learned about a page, on one line, hostname only.
 *
 * There is no server-side analytics in this app (PostHog is client-only), so
 * these lines are the whole server-side record. Never the full URL: which site
 * broke is useful, what someone is cooking is not ours to keep — the same rule
 * lib/analytics.ts states for events applies to logs.
 */
function logVerdict(url: URL, status: number, verdict: PageVerdict) {
  if (verdict.kind !== "bot_wall") return;
  console.warn(
    `parse: bot wall  host=${url.hostname} vendor=${verdict.vendor} ` +
      `signal=${verdict.signal} status=${status} confidence=${verdict.confidence}`,
  );
}

/**
 * The bucket a verdict belongs in, or undefined where the classifier does not
 * actually know.
 *
 * `none` at a non-2xx status is the undefined case on purpose: a 451, a 405 or
 * a 403 serving a full article are all real answers we have no better name
 * for, and the client's own status mapping already handles them. Asserting a
 * guess here would only make it wrong in a new place.
 */
function failureForVerdict(verdict: PageVerdict): ImportFailureCode | undefined {
  switch (verdict.kind) {
    case "bot_wall":
      return "blocked";
    // A pay or sign-in wall is not bot protection, but from the cook's side
    // the answer is the same one: this reader cannot get in, paste the text.
    // Same bucket as today, when 401 and 402 both mapped to `blocked`.
    case "paywall":
      return "blocked";
    case "not_found":
      return "not_found";
    case "server_error":
      return "backend_unavailable";
    case "none":
      return undefined;
  }
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
  /**
   * The parser reached the page and something is standing in front of it: a
   * bot challenge, or a post the platform withholds unless you are logged in.
   * An outcome rather than a throw so it can carry a `failure` and a vendor
   * out to the client — see the hook in `POST`.
   */
  | { kind: "blocked"; message: string }
  | { kind: "skipped" };

const SKIPPED: CookPilotServerOutcome = { kind: "skipped" };

/** The parser's own explanation, when its error body carries one. */
function parserErrorMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const message = (data as { error?: unknown }).error;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

async function parseWithCookPilotServer(url: string, hostname: string): Promise<CookPilotServerOutcome> {
  const endpoint = process.env.COOKPILOT_RECIPE_PARSER_URL?.trim();
  const secret = process.env.RECIPEPRINTER_PARSER_SECRET?.trim();
  if (!endpoint || !secret) return SKIPPED;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RecipePrinter-Parser-Secret": secret,
      },
      // `multiRecipe` is RecipePrinter's opt-in for roundup pages: CookPilot returns
      // every recipe it finds ({ recipes: [...] }) instead of just the main one.
      body: JSON.stringify({ url, multiRecipe: true }),
      signal: AbortSignal.timeout(COOKPILOT_TIMEOUT_MS),
    });
  } catch (err) {
    // A timeout here used to end the whole request: the abort threw straight
    // past the JSON-LD reader below and out as "that website took too long",
    // even when the site itself was fine and would have answered in a second.
    // Seen live on a plain 404 — the parser hung, and the fetch that would
    // have said "we couldn't find that page" never got its turn.
    //
    // A timeout is the definition of an inconclusive answer, which is what
    // `skipped` means, so it falls through like any other. Shortening this
    // budget makes the path more common, not less, so it has to be right.
    console.warn(
      `parse: cookpilot unreachable  host=${hostname} ms=${Date.now() - startedAt} ` +
        `err=${err instanceof Error ? err.name : "unknown"}`,
    );
    return SKIPPED;
  }

  // Cutting this budget from 55s to 30s is only safe if nothing real lives in
  // the window we removed, and we had no way to know because this route logs
  // nothing at all. Anything close to the new ceiling is worth seeing.
  const elapsed = Date.now() - startedAt;
  if (elapsed > COOKPILOT_TIMEOUT_MS * 0.6) {
    console.warn(`parse: cookpilot slow  host=${hostname} ms=${elapsed}`);
  }

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

  // 412 is the parser reporting that it reached the page and no server-side
  // reader can use it. It names the actual obstacle and what to do instead,
  // which is more use than anything this route could substitute, so its
  // message is carried out rather than replaced.
  //
  // It used to throw, which meant nothing after it ever ran. Now it returns,
  // because there IS one thing left to try: our own request, shaped like a
  // browser instead of like us. See the hook in `POST`.
  if (response.status === 412) {
    return { kind: "blocked", message: parserErrorMessage(data) ?? BLOCKED_REMEDY };
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
  // A 5xx is the parser being broken, which is the definition of an
  // inconclusive answer — so it falls through like a timeout does rather than
  // ending the request. It used to throw, and that mattered more than it
  // looks: measured against live sites, a plain 404 and a page the parser
  // simply dislikes both came back as 5xx here, so the JSON-LD reader below
  // never ran, the bot-wall classifier never saw the response, and the cook
  // got "we couldn't read that recipe page" for a page that would have
  // answered "we couldn't find that page" in half a second.
  //
  // 401/403/429 above deliberately still stop here: those are the parser
  // refusing us rather than failing, and they are answers.
  if (response.status >= 500) {
    console.warn(`parse: cookpilot ${response.status}  host=${hostname}`);
    return SKIPPED;
  }
  return SKIPPED;
}

export async function POST(request: Request) {
  const limit = rateLimit(`parse:${callerKey(request)}`, PARSE_LIMIT, PARSE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "That's a lot of imports at once. Wait a moment and try again.",
        rateLimited: true,
      } satisfies ParseResponse,
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let url: URL;

  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return errorResponse("Paste a recipe link first.");
    }
    url = new URL(unwrapRedirectUrl(normalizeImportURL(body.url)));
  } catch {
    return errorResponse("That doesn't look like a valid URL.");
  }

  // The client answers this one before it ever calls us (see `parseUrlAll`), so
  // reaching here means something skipped the UI. The check still belongs on
  // this side: behind it sits CookPilot's paid parser reached with our shared
  // secret, and a results page is up to 55 seconds of it spent on a page that
  // was never going to hold a recipe. 400 is deliberate — `shouldTryUrlFallback`
  // already treats it as final, so this can't turn into a second parse.
  const searchPage = searchPageMessage(url.toString());
  if (searchPage) return errorResponse(searchPage, { status: 400, failure: "search_page" });

  // Once the full parser has answered "no recipe", it stays answered for the
  // rest of this request — whatever our own direct fetch goes on to hit, asking
  // the client to run that same parser again can only reproduce it.
  let parserExhausted = false;

  try {
    // Validate BEFORE the parser call, not just inside `fetchPublicHtml`.
    // `parseWithCookPilotServer` hands this URL to the CookPilot parser, which
    // fetches it from *its* network with our shared secret — so leaving the
    // check to our own outbound fetch meant `http://169.254.169.254/...` or an
    // internal host was still reachable, just through the other leg. The
    // blocklist has to gate every fetch of this URL, ours and theirs.
    await validatePublicHttpUrl(url);

    const cookPilot = await parseWithCookPilotServer(url.toString(), url.hostname);
    if (cookPilot.kind === "recipes") {
      return NextResponse.json({ success: true, recipes: cookPilot.recipes } satisfies ParseResponse);
    }
    parserExhausted = cookPilot.kind === "empty";

    if (cookPilot.kind === "blocked") {
      // The parser reached the page and something is standing in front of it.
      // It does not say which obstacle, and one of the two it covers is a
      // login wall, so the vendor stays `generic` rather than claiming a
      // fingerprint we have not actually taken.
      console.warn(`parse: bot wall  host=${url.hostname} vendor=generic signal=cookpilot-412 status=412`);
      return errorResponse(cookPilot.message, {
        status: 422,
        // The client's fallback is CookPilot's own callable, and CookPilot is
        // what just said 412. It would fetch the same page from the same
        // place for the same answer.
        parserExhausted: true,
        failure: "blocked",
        botWall: { vendor: "generic" },
      });
    }

    const response = await fetchPublicHtml(url);

    if (!response.ok) {
      // The body used to be discarded here and the status mapped straight to
      // copy, which made a WAF block and a paywall the same event.
      const verdict = classifyPage({
        status: response.status,
        headers: response.headers,
        bodyPrefix: await readBodyPrefix(response),
      });
      logVerdict(url, response.status, verdict);

      // Deliberately NOT setting `parserExhausted` on a wall. The client's
      // fallback reads the page from Google's network rather than ours, and
      // that is not a theoretical second chance: of nine recipe sites that
      // wall this fetch, CookPilot's parser reads five of them perfectly well.
      const failure = failureForVerdict(verdict);
      const botWall = verdict.kind === "bot_wall" ? { vendor: verdict.vendor } : undefined;

      if (verdict.kind === "not_found") {
        return errorResponse("We couldn't find that page. Check the link and try again.", {
          status: 404,
          parserExhausted,
          failure,
        });
      }
      if (verdict.kind === "bot_wall" || verdict.kind === "paywall") {
        return errorResponse(BLOCKED_REMEDY, {
          status: response.status,
          parserExhausted,
          failure,
          botWall,
        });
      }
      return errorResponse("We couldn't open that recipe page. Try again, or paste the recipe text instead.", {
        status: response.status,
        parserExhausted,
        failure,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return errorResponse("That URL doesn't look like a recipe page.", { status: 400, parserExhausted });
    }

    const html = await readHtmlWithLimit(response);
    const recipe = [...jsonLdBlocksFromHtml(html), ...jsonDataBlocksFromHtml(html)]
      .map((block) => recipeFromJsonLd(block, response.url || url.toString()))
      .find(Boolean);

    if (!recipe) {
      // The gap this classifier was written for. A challenge page that answers
      // 200 clears the content-type gate above, carries no JSON-LD, and used
      // to be reported to the cook and to PostHog as "no recipe on that page"
      // — so `blocked` undercounted and `no_recipe`, the number the parser is
      // tuned against, was quietly counting walls.
      const verdict = classifyPage({
        status: response.status,
        headers: response.headers,
        bodyPrefix: html.slice(0, BODY_PREFIX_BYTES),
      });

      if (verdict.kind === "bot_wall") {
        logVerdict(url, response.status, verdict);
        return errorResponse(BLOCKED_REMEDY, {
          status: 422,
          parserExhausted,
          failure: "blocked",
          botWall: { vendor: verdict.vendor },
        });
      }

      return errorResponse(
        "We couldn't find a complete recipe on that page. Try another link or paste the recipe text instead.",
        { status: 422, parserExhausted },
      );
    }

    // The JSON-LD-only fallback picks a single recipe; wrap it as a one-element
    // array so the client sees the same `recipes` shape as the CookPilot path.
    return NextResponse.json({ success: true, recipes: [recipe] } satisfies ParseResponse);
  } catch (err) {
    if (err instanceof ParseHttpError) {
      return errorResponse(err.message, {
        status: err.status,
        parserExhausted: err.exhausted || parserExhausted,
      });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return errorResponse("That website took too long to respond. Try again, or paste the recipe text instead.", {
        status: 504,
        parserExhausted,
        failure: "timeout",
      });
    }
    return errorResponse("We couldn't import that recipe. Try again, paste the recipe text, or upload screenshots.", {
      status: 500,
      parserExhausted,
    });
  }
}
