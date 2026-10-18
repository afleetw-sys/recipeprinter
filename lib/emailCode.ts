"use client";

import { withAnonId } from "@/lib/parser";
import { sessionStore } from "@/lib/storage";

/**
 * Email sign-in by a 6-digit code (CookPilot `recipePrinterEmailCodeSend` /
 * `recipePrinterEmailCodeVerify`). The code proves the cook owns the address, so
 * an account made this way is verified from the start, and a new account never
 * needs a password.
 *
 * No retry on a dropped connection, unlike `callCookPilotParser`: sending twice
 * mails a second code (and replaces the first), and checking twice spends a try.
 */

export type SendCodeResult =
  | { status: "sent"; hasPassword: boolean }
  | { status: "use_provider"; provider: "google" | "apple" }
  | { status: "rate_limited"; retryAfterSec: number };

export type VerifyCodeResult =
  | { status: "ok"; token: string; created: boolean }
  | { status: "wrong"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "locked" };

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const [{ httpsCallable }, { getFns }] = await Promise.all([
    import("firebase/functions"),
    import("@/lib/firebase/functions"),
  ]);
  return (await httpsCallable(getFns(), name)(withAnonId(data))).data as T;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function sendEmailCode(email: string): Promise<SendCodeResult> {
  return call("recipePrinterEmailCodeSend", { email: normalizeEmail(email) });
}

export function verifyEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
  return call("recipePrinterEmailCodeVerify", { email: normalizeEmail(email), code });
}

/**
 * The code step, written down so a reload (or iOS dropping the tab while the
 * cook is in Mail fetching the code) comes back to it instead of to an empty
 * email field. Session storage: it belongs to this tab, and it lasts only as
 * long as a code does.
 */
const PENDING_KEY = "recipeprinter:email-code-pending:v1";
const PENDING_TTL_MS = 10 * 60 * 1000;

export interface PendingCode {
  email: string;
  hasPassword: boolean;
  sentAtMs: number;
}

export function rememberPendingCode(pending: PendingCode): void {
  sessionStore.setJson(PENDING_KEY, pending);
}

export function readPendingCode(now = Date.now()): PendingCode | null {
  const pending = sessionStore.getJson<PendingCode>(PENDING_KEY);
  if (!pending || typeof pending.email !== "string" || typeof pending.sentAtMs !== "number") return null;
  if (now - pending.sentAtMs > PENDING_TTL_MS) {
    forgetPendingCode();
    return null;
  }
  return pending;
}

export function forgetPendingCode(): void {
  sessionStore.remove(PENDING_KEY);
}
