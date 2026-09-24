"use client";

import { useEffect, useState } from "react";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import {
  hasMultiRecipeEntitlement,
  loadRecipePrinterCustomerInfo,
} from "@/lib/recipePrinterPurchases";

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
 */
export function useSingleRecipeOnly(): boolean {
  const { user } = useCookPilotAuth();
  const uid = user?.uid ?? null;
  const [hasMultiRecipe, setHasMultiRecipe] = useState(false);

  // Keyed on the uid, not the User object: Firebase hands out a new one on
  // every token refresh, which re-read RevenueCat hourly for an unchanged account.
  useEffect(() => {
    if (!uid) {
      setHasMultiRecipe(false);
      return;
    }
    let alive = true;
    loadRecipePrinterCustomerInfo(uid)
      .then((info) => {
        if (alive) setHasMultiRecipe(hasMultiRecipeEntitlement(info));
      })
      .catch((error) => {
        // Stays single-recipe, the pessimistic answer, as while it loads.
        console.warn("RecipePrinter: could not load multi-recipe access", error);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  return !hasMultiRecipe;
}
