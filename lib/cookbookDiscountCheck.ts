"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirstCookbookDiscountEligible } from "@/lib/cookbookProduct";
import { resolveEffectiveCustomerInfo } from "@/lib/proAccessFallback";
import {
  hasProEntitlement,
  loadRecipePrinterCustomerInfo,
} from "@/lib/recipePrinterPurchases";
import { loadRecipePrinterUserProfile } from "@/lib/recipePrinterUserProfile";

/**
 * Would this browser's signed-in account get the Pro first-cookbook price?
 *
 * For pages that only SHOW a price (the homepage's holiday banner) and have
 * no purchase flow of their own. Always imported dynamically: it pulls
 * Firebase and RevenueCat, which the homepage otherwise never loads for a
 * visitor who has never signed in.
 *
 * Same answer /print gives at checkout: live RevenueCat first, the mirrored
 * entitlement only if the live read fails, and `firstCookbookGrantedAt` from
 * the profile. Any doubt answers false, so a page shows the full price rather
 * than promise a discount checkout will not honour.
 */
export async function checkFirstCookbookDiscount(): Promise<boolean> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return false;

  const [live, profile] = await Promise.allSettled([
    loadRecipePrinterCustomerInfo(user.uid),
    loadRecipePrinterUserProfile(user.uid),
  ]);
  // Without the profile we cannot know whether a first cookbook was already
  // granted, and that is the half of the rule that takes the discount away.
  if (profile.status !== "fulfilled") return false;

  const now = Date.now();
  const effective = resolveEffectiveCustomerInfo({
    liveCustomerInfo: live.status === "fulfilled" ? live.value : null,
    liveStatus: live.status === "fulfilled" ? "ok" : "error",
    liveLastVerifiedAtMs: live.status === "fulfilled" ? now : null,
    mirroredEntitlements: profile.value.mirroredEntitlements,
    mirrorSyncedAtMs: profile.value.syncedAtMs,
    nowMs: now,
  });
  return isFirstCookbookDiscountEligible({
    hasPro: hasProEntitlement(effective.customerInfo),
    firstCookbookGrantedAt: profile.value.firstCookbookGrantedAt,
  });
}
