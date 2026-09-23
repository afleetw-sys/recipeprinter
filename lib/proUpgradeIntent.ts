"use client";

import { sessionStore } from "@/lib/storage";
import type { ProPlan } from "@/lib/proProduct";

/**
 * "I chose a Pro plan, and then you asked me to sign in."
 *
 * The upgrade flow is choose plan → sign in if needed → checkout: a cook
 * picks Monthly or Annual first, and only then, if signed out, does the same
 * dialog turn into sign-in. Once they're in, checkout starts immediately for
 * the plan they already chose — they are never asked to choose or confirm it
 * again. Unlike a cookbook or a legacy template purchase, RecipePrinter Pro
 * checkout needs an account at all (an ongoing subscription needs a durable
 * way back to it, via the account menu's "Manage subscription"), which an
 * anonymous RevenueCat id alone can't give a signed-out subscriber.
 *
 * That intent — which plan, waiting on which sign-in — has to survive the
 * trip, exactly like `lib/saveIntent.ts`'s: `signInWithCookPilotProvider`
 * uses `signInWithRedirect` on any phone, which reloads the page and would
 * otherwise leave a React ref back at its default — a cook who made an
 * account because we asked, only to land back on a plain print page with
 * their plan choice forgotten.
 */
// v2: stores a `plan` (cycle + auto-renew) where v1 stored a bare `cycle`.
const PRO_UPGRADE_INTENT_KEY = "recipeprinter:pro-upgrade-after-signin:v2";

/** Same rationale as `SAVE_INTENT_TTL_MS`: long enough for a slow sign-in or
 *  password reset, short enough that a forgotten choice doesn't fire a
 *  checkout on some unrelated later visit. */
const PRO_UPGRADE_INTENT_TTL_MS = 30 * 60 * 1000;

export interface ProUpgradeIntent {
  /** Where the upgrade was triggered from, for the `paywall_viewed` /
      `pro_feature_encountered` analytics already recorded when the dialog
      first opened — carried along so the resumed checkout's own events
      (`purchase_started`, etc.) can be understood in the same context. */
  trigger: string;
  plan: ProPlan;
}

interface StoredProUpgradeIntent extends ProUpgradeIntent {
  at: number;
}

/** Records the plan a signed-out cook chose, waiting on the sign-in that
 *  will let checkout for it actually start. */
export function rememberProUpgradeIntent(trigger: string, plan: ProPlan): void {
  sessionStore.setJson(PRO_UPGRADE_INTENT_KEY, {
    trigger,
    plan,
    at: Date.now(),
  } satisfies StoredProUpgradeIntent);
}

/** Drops it — the cook walked away from sign-in, or checkout resumed. */
export function forgetProUpgradeIntent(): void {
  sessionStore.remove(PRO_UPGRADE_INTENT_KEY);
}

/** The plan to resume checkout with, spending the intent if present.
 *  One-shot: signing in must not resume a checkout again on a later visit
 *  just because the flag was never explicitly cleared. */
export function takeProUpgradeIntent(now = Date.now()): ProUpgradeIntent | null {
  const intent = sessionStore.getJson<StoredProUpgradeIntent>(PRO_UPGRADE_INTENT_KEY);
  if (!intent) return null;
  forgetProUpgradeIntent();
  const expired = !Number.isFinite(intent.at) || now - intent.at > PRO_UPGRADE_INTENT_TTL_MS;
  return expired ? null : { trigger: intent.trigger, plan: intent.plan };
}

/**
 * "I clicked Print, and then checkout asked me to leave the page."
 *
 * Checkout itself is normally a same-page RevenueCat/Stripe overlay that
 * resolves via a promise — no reload, so `continueProCheckout`'s own
 * `onSettled` callback is what closes the dialog and resumes the print.
 * Some payment methods (a bank redirect, 3-D Secure) break out of that
 * overlay into a full top-level navigation instead, the same way a phone's
 * Google sign-in does — which abandons that promise mid-flight along with
 * every bit of in-memory state, and comes back to a plain reload of /print
 * with no way to tell a resumed print from a first visit.
 *
 * This is that flag, spanning the checkout itself rather than the sign-in
 * before it. It records only that a print was waiting, never a plan or
 * cycle, because the effect that reads it (see app/print/page.tsx) only
 * ever resumes the print once a live entitlement check confirms Pro is
 * actually active — it must not retry the purchase itself, which could
 * double-charge a payment that already went through before the reload.
 */
const PENDING_PRINT_AFTER_CHECKOUT_KEY = "recipeprinter:pro-checkout-pending-print:v1";
const PENDING_PRINT_AFTER_CHECKOUT_TTL_MS = 30 * 60 * 1000;

interface StoredPendingPrint {
  at: number;
}

/** Records that a print is waiting on the checkout about to start. */
export function rememberPendingPrintAfterCheckout(): void {
  sessionStore.setJson(PENDING_PRINT_AFTER_CHECKOUT_KEY, { at: Date.now() } satisfies StoredPendingPrint);
}

/** Drops it — checkout settled without a reload, or the resume already ran. */
export function forgetPendingPrintAfterCheckout(): void {
  sessionStore.remove(PENDING_PRINT_AFTER_CHECKOUT_KEY);
}

/**
 * Peeks rather than spends: the caller needs to hold onto this across
 * however many renders it takes the live entitlement check to resolve, and
 * only clear it once that check actually runs (see the effect that reads
 * this in app/print/page.tsx).
 */
export function hasPendingPrintAfterCheckout(now = Date.now()): boolean {
  const record = sessionStore.getJson<StoredPendingPrint>(PENDING_PRINT_AFTER_CHECKOUT_KEY);
  if (!record) return false;
  const expired = !Number.isFinite(record.at) || now - record.at > PENDING_PRINT_AFTER_CHECKOUT_TTL_MS;
  if (expired) {
    forgetPendingPrintAfterCheckout();
    return false;
  }
  return true;
}
