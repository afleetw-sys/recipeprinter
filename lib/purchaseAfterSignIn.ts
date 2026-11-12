"use client";

import { sessionStore } from "@/lib/storage";
import { hasAuthRedirectPending } from "@/lib/authRedirect";
import { currentPagePath } from "@/lib/currentPagePath";
import { proUpgradeIntentReturnPath } from "@/lib/proUpgradeIntent";

/**
 * "I pressed Buy, you asked me to sign in, and then you forgot what I was
 * buying."
 *
 * Nothing is sold signed out (see `useCookbookPurchase`), so a signed-out
 * Buy & download on a cookbook asks for sign-in first. On a phone that sign-in
 * is `signInWithRedirect`: the page goes to Google or Apple and a fresh one
 * comes back. Two things went wrong on that trip (Amelia, 2026-11-12):
 *
 * - Nothing remembered the purchase. The hook's comment said "the next press
 *   buys", so even a buyer who came back to the book had to find the button
 *   and press it again, and on desktop the popup closed onto the same
 *   unfinished purchase.
 * - Buyers came back on the homepage, which files the open project away on
 *   arrival (components/PrinterWorkspace.tsx), so the book they were paying
 *   for was gone from in front of them too.
 *
 * So the press is written down here, with the book it was about and the page
 * it was on, the same way `lib/saveIntent` and `lib/proUpgradeIntent` carry
 * their own presses across the trip. Session storage: it belongs to this tab
 * and this errand.
 */
const COOKBOOK_PURCHASE_KEY = "recipeprinter:cookbook-purchase-after-signin:v1";

/** Same window as the save and Pro intents: a slow sign-in or password reset
 *  fits; a forgotten press does not open checkout on some later visit. */
const COOKBOOK_PURCHASE_TTL_MS = 30 * 60 * 1000;

interface StoredCookbookPurchase {
  /** The book being bought. Another one is not what they agreed to pay for. */
  projectId: string;
  /** The page the press was on, path and query. */
  returnTo: string | null;
  at: number;
}

function readLive(now: number): StoredCookbookPurchase | null {
  const intent = sessionStore.getJson<StoredCookbookPurchase>(COOKBOOK_PURCHASE_KEY);
  if (!intent) return null;
  if (!Number.isFinite(intent.at) || now - intent.at > COOKBOOK_PURCHASE_TTL_MS) {
    forgetCookbookPurchaseAfterSignIn();
    return null;
  }
  return intent;
}

/** Records that this book's purchase is waiting on a sign-in. */
export function rememberCookbookPurchaseAfterSignIn(projectId: string): void {
  sessionStore.setJson(COOKBOOK_PURCHASE_KEY, {
    projectId,
    returnTo: currentPagePath(),
    at: Date.now(),
  } satisfies StoredCookbookPurchase);
}

/** Drops it: the cook closed sign-in, or the purchase resumed. */
export function forgetCookbookPurchaseAfterSignIn(): void {
  sessionStore.remove(COOKBOOK_PURCHASE_KEY);
}

/**
 * Whether the book in front of us is the one somebody pressed Buy on, spending
 * the record either way. One-shot: checkout must not reopen on the next render,
 * the next token refresh or the next visit.
 */
export function takeCookbookPurchaseAfterSignIn(projectId: string, now = Date.now()): boolean {
  const intent = readLive(now);
  if (!intent) return false;
  forgetCookbookPurchaseAfterSignIn();
  return intent.projectId === projectId;
}

/**
 * Where this load belongs, when it is the return leg of a sign-in redirect that
 * left from a purchase on another page; otherwise null.
 *
 * Only for a redirect (`hasAuthRedirectPending`): a popup or email-code sign-in
 * never leaves the page, so someone who walks home with a sign-in dialog open
 * is just going home. Reads the purchases without spending them; the page they
 * are sent back to is what resumes the purchase.
 */
export function purchaseReturnPath(now = Date.now()): string | null {
  if (!hasAuthRedirectPending()) return null;
  const here = currentPagePath();
  for (const returnTo of [readLive(now)?.returnTo, proUpgradeIntentReturnPath(now)]) {
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") && returnTo !== here) return returnTo;
  }
  return null;
}
