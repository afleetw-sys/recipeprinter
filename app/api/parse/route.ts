import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { jsonDataBlocksFromHtml, jsonLdBlocksFromHtml, recipeFromJsonLd } from "@/lib/schemaRecipe";
import { normalizeImportURL } from "@/lib/cookpilot";
import type { ParseResponse } from "@/types/recipe";

export const runtime = "nodejs";

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

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ success: false, error } satisfies ParseResponse, { status });
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
    throw new ParseHttpError("Only HTTP and HTTPS recipe URLs are supported.");
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
      if (!location) throw new ParseHttpError("That recipe page redirected unexpectedly.", 502);
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return response;
  }

  throw new ParseHttpError("That recipe page redirected too many times.", 508);
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

export async function POST(request: Request) {
  let url: URL;

  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return errorResponse("Paste a recipe URL first.");
    }
    url = new URL(normalizeImportURL(body.url));
  } catch {
    return errorResponse("That doesn't look like a valid URL.");
  }

  try {
    const response = await fetchPublicHtml(url);

    if (!response.ok) {
      return errorResponse(`That page returned HTTP ${response.status}.`, response.status);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return errorResponse("That URL doesn't look like a recipe page.");
    }

    const html = await readHtmlWithLimit(response);
    const recipe = [...jsonLdBlocksFromHtml(html), ...jsonDataBlocksFromHtml(html)]
      .map((block) => recipeFromJsonLd(block, response.url || url.toString()))
      .find(Boolean);

    if (!recipe) {
      return errorResponse("No recipe could be found on that page.", 422);
    }

    return NextResponse.json({ success: true, recipe } satisfies ParseResponse);
  } catch (err) {
    if (err instanceof ParseHttpError) {
      return errorResponse(err.message, err.status);
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return errorResponse("The recipe page took too long to respond.", 504);
    }
    return errorResponse("We couldn't import a recipe from that URL.", 500);
  }
}
