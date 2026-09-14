"use client";

import { sessionStore } from "@/lib/storage";
import type { ProBillingCycle } from "@/lib/proProduct";

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
const PRO_UPGRADE_INTENT_KEY = "recipeprinter:pro-upgrade-after-signin:v1";

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
  cycle: ProBillingCycle;
}

interface StoredProUpgradeIntent extends ProUpgradeIntent {
  at: number;
}

/** Records the plan a signed-out cook chose, waiting on the sign-in that
 *  will let checkout for it actually start. */
export function rememberProUpgradeIntent(trigger: string, cycle: ProBillingCycle): void {
  sessionStore.setJson(PRO_UPGRADE_INTENT_KEY, {
    trigger,
    cycle,
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
  return expired ? null : { trigger: intent.trigger, cycle: intent.cycle };
}
