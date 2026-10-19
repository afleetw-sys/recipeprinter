"use client";

import { withAnonId } from "@/lib/parser";

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

export { forgetPendingCode, readPendingCode, rememberPendingCode, type PendingCode } from "@/lib/emailCodePending";
