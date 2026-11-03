"use client";

import { useEffect, useState } from "react";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import {
  hasMultiRecipeEntitlement,
  loadRecipePrinterCustomerInfo,
} from "@/lib/recipePrinterPurchases";
import { resolveEffectiveCustomerInfo } from "@/lib/proAccessFallback";
import { loadRecipePrinterUserProfile } from "@/lib/recipePrinterUserProfile";

/**
 * A library picker's own fallback answer for "can this account add more than
 * one recipe" — for any caller that doesn't already know its own entitlement
 * precisely (`/print` does, via `computeProLocks`'s mirror-fallback-aware
 * resolution, and always passes a real boolean instead of using this).
 *
 * Pro is only ever held by a signed-in CookPilot account, so a signed-out
 * visitor is single-recipe-only with no network call at all. Signed in, this
 * does a one-time entitlement check, pessimistic (single-recipe-only) while
 * it resolves — a real Pro subscriber can see one render of the free
 * behavior before this corrects, a free cook can never see the reverse.
 *
 * Every direct renderer of `PaprikaImportSource`/`CookPilotImportSource` needs
 * to call this itself (or receive an explicit `singleSelect` from a caller
 * that already knows) — there were two such renderers (`RecipeAppsPanel`, and
 * the Paprika-only SEO capture) before this was pulled out, and the second
 * one silently missed the gate because the check lived only in the first.
 * Centralizing it here is what stops that from happening a third time.
 *
 * When RevenueCat can't be reached, the answer is the account's server-side
 * mirror of its purchases, the same fallback /print uses
 * (`resolveEffectiveCustomerInfo`). It used to stay single-recipe instead, so
 * a Pro member's library had no Select all whenever RevenueCat was down, and
 * the failed check surfaced as an uncaught error.
 */
export function useSingleRecipeOnly(): boolean {
  const { user } = useCookPilotAuth();
  const [hasMultiRecipe, setHasMultiRecipe] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasMultiRecipe(false);
      return;
    }
    let alive = true;
    void (async () => {
      let live: Awaited<ReturnType<typeof loadRecipePrinterCustomerInfo>> = null;
      let liveOk = true;
      try {
        live = await loadRecipePrinterCustomerInfo(user.uid);
      } catch {
        liveOk = false;
      }
      const profile = liveOk ? null : await loadRecipePrinterUserProfile(user.uid).catch(() => null);
      const { customerInfo } = resolveEffectiveCustomerInfo({
        liveCustomerInfo: live,
        liveStatus: liveOk ? "ok" : "error",
        liveLastVerifiedAtMs: null,
        mirroredEntitlements: profile?.mirroredEntitlements ?? null,
        mirrorSyncedAtMs: profile?.syncedAtMs ?? null,
        nowMs: Date.now(),
      });
      if (alive) setHasMultiRecipe(hasMultiRecipeEntitlement(customerInfo));
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  return !hasMultiRecipe;
}
