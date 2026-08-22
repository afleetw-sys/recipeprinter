import { NextResponse } from "next/server";
import {
  bearerToken,
  cookbookAccessConfigured,
  hasCookbookUnlock,
  projectIdFromPayload,
  verifyIdToken,
} from "@/lib/server/cookbookAccess";
import { callerKey, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
// A cookbook is dozens of pages and the renderer cold-starts Chromium, so the
// default function timeout is not enough. Vercel caps this by plan; if a very
// large book ever exceeds it the client surfaces the failure rather than
// silently handing back a truncated file.
export const maxDuration = 300;

/**
 * Renders a cookbook to PDF, for the person who bought it.
 *
 * This route used to check nothing at all. It kept `RECIPEPRINTER_PDF_AUTH` off
 * the client, which is necessary but was mistaken for sufficient: keeping the
 * secret private is not the same as keeping the endpoint private. Anyone able
 * to form a POST got the paid renderer, which made it simultaneously the
 * cheapest way around the $19.99 paywall and an uncapped way to spend 300
 * seconds of Chromium per request on someone else's bill.
 *
 * Three gates now, cheapest first:
 *
 *   1. rate limit — before any work, and before any network call
 *   2. identity — a real Firebase ID token, verified against Google
 *   3. entitlement — an unlock document for THIS book, owned by THAT account
 *
 * Step 3 is trustworthy because of work already done: `firestore.rules` denies
 * every client write to `cookbookUnlocks`, so the document can only have come
 * from the RevenueCat webhook. Nobody can mint themselves one.
 */

// Generous enough that nobody legitimate meets it: a hardcover export is two
// renders (interior + cover wrap), and trying both formats is four. Ten leaves
// room to retry a failure and still not be the reason a book didn't arrive.
const EXPORT_LIMIT = 10;
const EXPORT_WINDOW_MS = 10 * 60 * 1000;

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(request: Request) {
  const limit = rateLimit(`cookbook-pdf:${callerKey(request)}`, EXPORT_LIMIT, EXPORT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's a lot of exports at once. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const endpoint = process.env.RECIPEPRINTER_PDF_URL?.trim();
  const secret = process.env.RECIPEPRINTER_PDF_AUTH?.trim();
  if (!endpoint || !secret) {
    // Not configured is a deployment state, not a user mistake — say so plainly
    // so it can't be mistaken for a broken cookbook.
    return jsonError("PDF export isn't configured on this deployment.", 503);
  }

  // Refusing to render is the only safe answer when entitlement can't be
  // checked. Rendering anyway would restore exactly the hole this closes.
  if (!cookbookAccessConfigured()) {
    return jsonError("PDF export isn't configured on this deployment.", 503);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Malformed request.", 400);
  }

  const bookProjectId = projectIdFromPayload(payload);
  if (!bookProjectId) {
    return jsonError("That request didn't name a cookbook.", 400);
  }

  const idToken = bearerToken(request);
  if (!idToken) {
    // `needsAuth` lets the client offer an account button instead of an error;
    // `needsAccount` picks between "create one" and "sign back in".
    //
    // Copy note: this deliberately does not explain where the purchase is kept
    // or why an account is what proves it. That is our storage model, not
    // something a customer should have to understand to download the book they
    // paid for. The sign-in dialog itself says why ("Don't lose your purchase").
    return jsonError("Create a free account to download your cookbook.", 401, {
      needsAuth: true,
      needsAccount: true,
    });
  }

  const uid = await verifyIdToken(idToken);
  if (!uid) {
    return jsonError("You've been signed out. Sign in again to download your cookbook.", 401, {
      needsAuth: true,
      needsAccount: false,
    });
  }

  let unlocked: boolean;
  try {
    unlocked = await hasCookbookUnlock(uid, bookProjectId, idToken);
  } catch (error) {
    // Couldn't ask. That is not the same as "no", and a paying customer must
    // never be told their purchase doesn't exist because a lookup failed.
    console.warn("cookbook-pdf: could not check entitlement", error);
    return jsonError("We couldn't confirm your purchase just now. Try again in a moment.", 503);
  }

  if (!unlocked) {
    // Names the likeliest cause and what to do about it. The common way to see
    // this is buying with one email and signing in with another.
    return jsonError(
      "We couldn't find this cookbook on your account. If you bought it with a different email, sign in with that one.",
      403,
      { needsAuth: true, needsAccount: false },
    );
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: secret },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("cookbook-pdf: renderer unreachable", error);
    return jsonError("The cookbook renderer didn't respond.", 502);
  }

  if (!response.ok) {
    console.warn("cookbook-pdf: renderer failed", response.status);
    return jsonError("The cookbook couldn't be rendered.", 502);
  }

  // Streamed, not buffered: a book runs to several MB and there is no reason to
  // hold all of it in this function's memory before the download starts.
  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
    },
  });
}
