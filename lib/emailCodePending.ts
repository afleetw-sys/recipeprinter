"use client";

import { sessionStore } from "@/lib/storage";

/**
 * The code step, written down so a reload (or iOS dropping the tab while the
 * cook is in Mail fetching the code) comes back to it instead of to an empty
 * email field. Session storage: it belongs to this tab, and it lasts only as
 * long as a code does.
 *
 * Its own module, free of Firebase, because the header (AccountControl) reads
 * it on every page to decide whether to bring the sign-in dialog back.
 */
const PENDING_KEY = "recipeprinter:email-code-pending:v1";
/** How long a code works (CookPilot CODE_TTL_MS), and so how long this record lasts. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000;

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
  if (now - pending.sentAtMs > CODE_LIFETIME_MS) {
    forgetPendingCode();
    return null;
  }
  return pending;
}

export function forgetPendingCode(): void {
  sessionStore.remove(PENDING_KEY);
}
