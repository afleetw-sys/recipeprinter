"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";
import { cookbookOfferFor, type CookbookOffer } from "@/lib/cookbookProduct";
import { isBlackFridayLive, wasProBeforeBlackFriday } from "@/lib/blackFriday";
import { resolveEffectiveCustomerInfo } from "@/lib/proAccessFallback";
import {
  hasProEntitlement,
  loadRecipePrinterCustomerInfo,
} from "@/lib/recipePrinterPurchases";
import { loadRecipePrinterUserProfile } from "@/lib/recipePrinterUserProfile";

/**
 * The cookbook price this browser's signed-in account would be offered: the
 * Pro first-cookbook price, a sale price (lib/blackFriday.ts), or full.
 *
 * For pages that only SHOW a price (the homepage's holiday banner) and have
 * no purchase flow of their own. Always imported dynamically: it pulls
 * Firebase and RevenueCat, which the homepage otherwise never loads for a
 * visitor who has never signed in.
 *
 * Same answer /print gives at checkout: live RevenueCat first, the mirrored
 * entitlement only if the live read fails, and `firstCookbookGrantedAt` from
 * the profile. Any doubt answers the offer for a cook who isn't Pro, so a page
 * never promises a discount checkout will not honour.
 */
export async function checkCookbookOffer(): Promise<CookbookOffer> {
  const saleLive = isBlackFridayLive();
  const noPro = cookbookOfferFor({ hasPro: false, proBeforeSale: false, firstCookbookGrantedAt: null, saleLive });
  const standing = await readStanding();
  if (!standing) return noPro;
  return cookbookOfferFor({ ...standing, saleLive });
}

/**
 * Where this browser's account stands in the sale (lib/blackFriday.ts), for
 * the banner: "member" was Pro before it began ($9.99 books), "new" went Pro
 * since ($15.99 books, nothing more to sell), "none" isn't Pro.
 */
export async function checkSaleStanding(): Promise<"member" | "new" | "none"> {
  const standing = await readStanding();
  if (!standing?.hasPro) return "none";
  return standing.proBeforeSale ? "member" : "new";
}

async function readStanding(): Promise<{
  hasPro: boolean;
  proBeforeSale: boolean;
  firstCookbookGrantedAt: number | null;
} | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  const [live, profile] = await Promise.allSettled([
    loadRecipePrinterCustomerInfo(user.uid),
    loadRecipePrinterUserProfile(user.uid),
  ]);
  // Without the profile we cannot know whether a first cookbook was already
  // granted, and that is the half of the rule that takes the discount away.
  if (profile.status !== "fulfilled") return null;

  const now = Date.now();
  const effective = resolveEffectiveCustomerInfo({
    liveCustomerInfo: live.status === "fulfilled" ? live.value : null,
    liveStatus: live.status === "fulfilled" ? "ok" : "error",
    liveLastVerifiedAtMs: live.status === "fulfilled" ? now : null,
    mirroredEntitlements: profile.value.mirroredEntitlements,
    mirrorSyncedAtMs: profile.value.syncedAtMs,
    nowMs: now,
  });
  return {
    hasPro: hasProEntitlement(effective.customerInfo),
    proBeforeSale: wasProBeforeBlackFriday(effective.customerInfo),
    firstCookbookGrantedAt: profile.value.firstCookbookGrantedAt,
  };
}
