import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { planCardExport } from "@/lib/server/cardExport";
import { bearerToken, checkIdToken } from "@/lib/server/cookbookAccess";
import { activeEntitlements, anonymousEntitlements, isAnonymousCustomerId } from "@/lib/server/printPass";
import { callerKey, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Recipe cards as a file: PDF, PNG or JPG.
 *
 * The same renderer and the same `/export` page as a cookbook's PDF
 * (docs/cookbook-pdf-export.md), so the file matches the preview. What differs
 * is who may ask. A cookbook export proves a purchase; this is open to
 * everyone, signed in or not, because printing a card is free. What it checks
 * instead is the three Pro locks a print sits behind (`planCardExport`), from
 * the caller's own entitlements: an account's ID token, or signed out, the
 * anonymous RevenueCat id a purchase belongs to. With neither, the caller is
 * on the free plan.
 *
 * Every render starts a Chromium on our bill, so the limit is per caller and
 * tighter than a page load would need.
 */

const LIMIT = 12;
const WINDOW_MS = 10 * 60 * 1000;
/** Cards are text and photo URLs. Past this it is not a deck of cards. */
const MAX_BODY_BYTES = 4_000_000;
const RENDERER_TIMEOUT_MS = 100_000;

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * What the caller owns. `null` when it could not be read, which is not the
 * same as owning nothing: a subscriber must not be shown a paywall because a
 * lookup failed.
 */
async function callerEntitlements(request: Request, customerId: unknown): Promise<string[] | null> {
  const idToken = bearerToken(request);
  try {
    if (idToken) {
      const check = await checkIdToken(idToken);
      if (!check.ok) return check.kind === "unavailable" ? null : [];
      return (await activeEntitlements(check.uid, idToken)).ent;
    }
    if (isAnonymousCustomerId(customerId)) return (await anonymousEntitlements(customerId)).ent;
    return [];
  } catch (error) {
    console.warn("card-export: could not read entitlements", error);
    return null;
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const limit = rateLimit(`card-export:${callerKey(request)}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's a lot of downloads at once. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const endpoint = process.env.RECIPEPRINTER_PDF_URL?.trim();
  const secret = process.env.RECIPEPRINTER_PDF_AUTH?.trim();
  if (!endpoint || !secret) return jsonError("Downloads aren't configured on this deployment.", 503);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return jsonError("That's too much for one download.", 413);
    body = JSON.parse(raw);
  } catch {
    return jsonError("Malformed request.", 400);
  }

  const customerId = (body as { customerId?: unknown } | null)?.customerId;
  const entitlements = await callerEntitlements(request, customerId);
  // Planned as a free caller when the lookup failed: a free deck still
  // downloads, and only a deck that needs Pro has to be told to try again.
  const plan = planCardExport(body, entitlements ?? []);
  if (!plan.ok && plan.kind === "invalid") return jsonError(plan.error, 400);
  if (!plan.ok) {
    if (entitlements === null) {
      return jsonError("We couldn't confirm your plan just now. Try again in a moment.", 503);
    }
    return jsonError("This download needs RecipePrinter Pro.", 403, { needsPro: true, reasons: plan.reasons });
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: secret,
        "x-recipeprinter-request-id": requestId,
      },
      body: JSON.stringify(plan.payload),
      signal: AbortSignal.timeout(RENDERER_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.warn(`card-export: renderer timed out requestId=${requestId} ms=${Date.now() - startedAt}`);
      return jsonError("That took too long to make. Try again in a moment.", 504);
    }
    console.warn(`card-export: renderer unreachable requestId=${requestId}`, error);
    const devDetail =
      process.env.NODE_ENV === "development"
        ? ` (dev: nothing answered at ${endpoint}. Run \`npm run pdf:dev\` in a second terminal.)`
        : "";
    return jsonError(`The download couldn't be made.${devDetail}`, 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(
      `card-export: renderer failed requestId=${requestId} status=${response.status} body=${detail.slice(0, 2000)}`,
    );
    if (response.status === 422) {
      return jsonError("A photo couldn't be loaded, so we stopped. Check your connection and try again.", 502);
    }
    const devDetail = process.env.NODE_ENV === "development" && detail ? ` (dev: ${detail})` : "";
    return jsonError(`The download couldn't be made.${devDetail}`, 502);
  }

  const rendered = (await response.json().catch(() => null)) as
    | { downloadUrl?: unknown; fileName?: unknown }
    | null;
  if (typeof rendered?.downloadUrl !== "string" || !rendered.downloadUrl) {
    console.warn(`card-export: renderer returned an invalid success requestId=${requestId}`);
    return jsonError("The download couldn't be made. Try again in a moment.", 502);
  }
  // A renderer from before pictures existed ignores `output` and answers with
  // a PDF, and names no file. Refuse it rather than hand over a PDF called .png.
  if (plan.payload.output !== "pdf" && typeof rendered.fileName !== "string") {
    console.warn(`card-export: renderer does not make pictures yet requestId=${requestId}`);
    return jsonError("Picture downloads aren't available yet. Try PDF for now.", 503);
  }
  console.log(
    `card-export: rendered requestId=${requestId} output=${plan.payload.output} ms=${Date.now() - startedAt}`,
  );
  return NextResponse.json(
    {
      downloadUrl: rendered.downloadUrl,
      // Several pictures come back as one zip, which the renderer names.
      fileName: typeof rendered.fileName === "string" ? rendered.fileName : plan.payload.fileName,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
