import { NextResponse } from "next/server";
import { bearerToken, checkIdToken } from "@/lib/server/cookbookAccess";
import { callerKey, rateLimit } from "@/lib/server/rateLimit";
import {
  activeEntitlements,
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
 *   POST { action: "verify", pass }                      → { ent, exp } or 401
 *
 * Issuing needs a signed-in account and reads its entitlements as that user.
 * Verifying needs nothing but the pass, since Safari has no sign-in: the
 * signature is the proof.
 */

const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const limit = rateLimit(`print-pass:${callerKey(request)}`, LIMIT, WINDOW_MS);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  if (!printPassConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  let body: { action?: unknown; pass?: unknown };
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
  if (!idToken) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const check = await checkIdToken(idToken);
  if (!check.ok) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    const now = Date.now();
    const { ent, endsAt } = await activeEntitlements(check.uid, idToken, now);
    if (ent.length === 0) return NextResponse.json({ pass: null });
    const exp = Math.min(now + PASS_LIFETIME_MS, endsAt ?? Number.POSITIVE_INFINITY);
    return NextResponse.json({ pass: signPrintPass({ ent, exp }) });
  } catch (error) {
    console.warn("print-pass: could not read entitlements", error);
    return NextResponse.json({ error: "Try again." }, { status: 503 });
  }
}
