import { NextResponse } from "next/server";
import { bearerToken, checkIdToken } from "@/lib/server/cookbookAccess";
import { callerKey, rateLimit } from "@/lib/server/rateLimit";
import {
  activeEntitlements,
  anonymousEntitlements,
  isAnonymousCustomerId,
  PASS_LIFETIME_MS,
  printPassConfigured,
  readPrintPass,
  signPrintPass,
} from "@/lib/server/printPass";

export const runtime = "nodejs";

/**
 * Print passes for the Safari hand-off (see lib/server/printPass).
 *
 *   POST { action: "issue" }   with the cook's ID token → { pass } or { pass: null }
 *   POST { action: "issue", customerId }  signed out, an anonymous RevenueCat id
 *   POST { action: "verify", pass }                      → { ent, exp } or 401
 *
 * Issuing needs proof of whose purchase it is: an account's ID token (its
 * entitlements are then read as that user), or, signed out, the anonymous
 * RevenueCat id the purchase belongs to (asked of RevenueCat). Verifying needs
 * nothing but the pass, since Safari has no sign-in: the signature is the
 * proof.
 */

const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const limit = rateLimit(`print-pass:${callerKey(request)}`, LIMIT, WINDOW_MS);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  if (!printPassConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  let body: { action?: unknown; pass?: unknown; customerId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (body.action === "verify") {
    const pass = typeof body.pass === "string" ? readPrintPass(body.pass) : null;
    if (!pass) return NextResponse.json({ error: "Invalid or expired." }, { status: 401 });
    return NextResponse.json(pass);
  }

  if (body.action !== "issue") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const idToken = bearerToken(request);
  let read: (now: number) => Promise<{ ent: string[]; endsAt: number | null }>;
  if (idToken) {
    const check = await checkIdToken(idToken);
    if (!check.ok) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    read = (now) => activeEntitlements(check.uid, idToken, now);
  } else if (isAnonymousCustomerId(body.customerId)) {
    const customerId = body.customerId;
    read = (now) => anonymousEntitlements(customerId, now);
  } else {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const now = Date.now();
    const { ent, endsAt } = await read(now);
    if (ent.length === 0) return NextResponse.json({ pass: null });
    const exp = Math.min(now + PASS_LIFETIME_MS, endsAt ?? Number.POSITIVE_INFINITY);
    return NextResponse.json({ pass: signPrintPass({ ent, exp }) });
  } catch (error) {
    console.warn("print-pass: could not read entitlements", error);
    return NextResponse.json({ error: "Try again." }, { status: 503 });
  }
}
