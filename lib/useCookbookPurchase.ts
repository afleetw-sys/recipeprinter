"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { COOKBOOK_DISCOUNT_PRICE_FALLBACK, COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import { track, truncateReason } from "@/lib/analytics";
import {
  purchaseRecipePrinterCookbook,
} from "@/lib/recipePrinterPurchases";
import {
  isCookbookProjectUnlocked,
  loadCookbookProjectUnlock,
  markCookbookProjectUnlockedLocal,
  markCookbookUnlockPending,
  pendingCookbookUnlock,
} from "@/lib/cookbookUnlocks";

interface UseCookbookPurchaseOptions {
  /** Shared with usePremiumTemplatePurchase so this doesn't re-run RevenueCat
      identify/link/configure a second time for the same browser session. */
  revenueCatUserId: string | null;
  cookPilotUser: User | null;
  cookbookMode: boolean;
  projectId: string;
  /** Whether THIS purchase, right now, qualifies for 20% off (active Pro,
      never granted a cookbook before) — computed by the caller from
      `effectiveCustomerInfo`/the signed-in profile (lib/cookbookProduct.ts's
      `isFirstCookbookDiscountEligible`), re-checked fresh at call time
      rather than cached here. */
  discountEligible: boolean;
  showToast: (message: string) => void;
  clearToast: () => void;
  onFreshPurchase: () => void;
  /** Fired once a purchase actually grants (never on cancel/failure) with
      whether it used the discount — lets the caller optimistically mark
      this account as no longer eligible immediately, without waiting for a
      Firestore round trip, so a second cookbook purchase started later in
      the same session can't also resolve the discounted product. */
  onCookbookGranted: (usedDiscount: boolean) => void;
}

/**
 * Owns the "make it a cookbook" paywall: whether this project is already
 * unlocked, and the purchase flow triggered at export time. Mirrors
 * usePremiumTemplatePurchase's unlock-then-continue shape, against a
 * per-project unlock rather than a per-template entitlement.
 *
 * It takes no RevenueCat `CustomerInfo`, deliberately. It used to accept
 * `customerInfo` and `refreshCustomerInfo` and read neither — both were left
 * behind when the account-wide entitlement bridge below was deleted, and while
 * they sat in the signature this looked like a hook that consults entitlements.
 * It does not: ACCESS here is one thing, a server-written unlock document,
 * unrelated to Pro. `discountEligible` is the one exception, and it's
 * PRICE, not access — a plain boolean the caller has already resolved
 * (Pro status and prior-grant history live entirely outside this hook), used
 * only to pick which of two identically-unlocking RevenueCat products to
 * check out with.
 */
export function useCookbookPurchase({
  revenueCatUserId,
  cookPilotUser,
  cookbookMode,
  projectId,
  discountEligible,
  showToast,
  clearToast,
  onFreshPurchase,
  onCookbookGranted,
}: UseCookbookPurchaseOptions) {
  const [cookbookPurchaseBusy, setCookbookPurchaseBusy] = useState(false);
  const [projectUnlocked, setProjectUnlocked] = useState(() =>
    isCookbookProjectUnlocked(projectId),
  );
  const unlockKey = cookPilotUser ? `${cookPilotUser.uid}:${projectId}` : null;
  const [resolvedUnlockKey, setResolvedUnlockKey] = useState<string | null>(() =>
    isCookbookProjectUnlocked(projectId) ? unlockKey : null,
  );

  useEffect(() => {
    setProjectUnlocked(isCookbookProjectUnlocked(projectId));
    if (!cookPilotUser) {
      // Signed out there is no server to ask, so the local marker is the only
      // answer available — see `loadCookbookProjectUnlock`.
      setResolvedUnlockKey(null);
      return;
    }
    // Signed in, ALWAYS ask, even when the cache says unlocked. Skipping the
    // read on a cached "yes" is what let a stale marker outrank the account:
    // /projects (reading Firestore) showed "Not purchased" while this page
    // showed an unlocked book, and no amount of deleting documents could
    // change it. The answer below can now revoke as well as grant.
    const key = `${cookPilotUser.uid}:${projectId}`;
    let cancelled = false;
    loadCookbookProjectUnlock(cookPilotUser.uid, projectId)
      .then((unlocked) => {
        if (!cancelled) setProjectUnlocked(unlocked);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setResolvedUnlockKey(key);
      });
    return () => {
      cancelled = true;
    };
    // The uid, not the User object: Firebase replaces that object on every
    // token refresh, and depending on its identity re-issued both unlock reads
    // for an account that had not changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser?.uid, projectId]);

  // A purchase that completed on THIS device but whose webhook write hasn't
  // landed yet. `markCookbookUnlockPending` is set at checkout and cleared once
  // the project is marked, so this only ever matches the project just bought —
  // it cannot grant a different one.
  useEffect(() => {
    if (projectUnlocked || pendingCookbookUnlock() !== projectId) return;
    markCookbookProjectUnlockedLocal(projectId);
    setProjectUnlocked(true);
  }, [projectId, projectUnlocked]);

  /* The legacy account-wide bridge lived here, and it was a free-unlock hole.
     It granted access to whatever project was open whenever the RevenueCat
     `cookbook` entitlement was present and no unlock doc was found — guarded
     only by a localStorage key, so a fresh browser profile re-armed it. Buy one
     cookbook, open another in incognito, and it unlocked. The Firestore rules
     lockdown could not touch it: it writes nothing, it just flips local state.

     It is deleted rather than repaired because it protects nobody: the cookbook
     was not yet on sale when it went, so no customer can hold the former
     account-wide unlock. Entitlement is now one thing only: a server-written
     unlock document. */

  // The local marker is evidence of NEITHER answer for a signed-in account: a
  // missing one may just be a new device, and a present one may be stale (a
  // deleted or refunded unlock). So while signed in, access stays tri-state
  // until the server answers — neither the paid workspace nor its paywall
  // renders on a guess, in either direction.
  //
  // This deliberately no longer exits `loading` early when the cache says
  // unlocked. Doing so is what produced a book that showed as owned on this
  // page and "Not purchased" on /projects at the same time.
  const cookbookUnlockLoading = Boolean(
    cookbookMode && cookPilotUser && resolvedUnlockKey !== unlockKey,
  );
  const cookbookAccessStatus: "loading" | "unlocked" | "locked" = !cookbookMode
    ? "unlocked"
    : cookbookUnlockLoading
      ? "loading"
      : projectUnlocked
        ? "unlocked"
        : "locked";
  const cookbookLocked = cookbookAccessStatus === "locked";

  /** Buys the cookbook entitlement, then hands control back to `onUnlocked`
      (typically re-running the export/print gate) rather than printing
      directly — the caller may still have a locked premium template to
      resolve after this purchase clears. */
  async function purchaseCookbookAndContinue(onUnlocked: (freshPurchase: boolean) => void) {
    if (!revenueCatUserId) {
      showToast("Purchases aren't ready yet. Wait a moment, then try again.");
      return;
    }

    setCookbookPurchaseBusy(true);
    clearToast();
    // Captured once, at the start of this specific purchase: whatever was
    // true the moment the buyer committed, not re-read mid-flow, and visible
    // to the catch block below too.
    const usingDiscount = discountEligible;
    try {
      if (isCookbookProjectUnlocked(projectId)) {
        setProjectUnlocked(true);
        onUnlocked(false);
        return;
      }

      track("purchase_started", {
        product: "cookbook",
        customerId: revenueCatUserId,
        ...(usingDiscount ? { discount: "pro_first" as const } : {}),
      });
      const result = await purchaseRecipePrinterCookbook({
        userId: revenueCatUserId,
        email: cookPilotUser?.email,
        projectId,
        discountEligible: usingDiscount,
      });

      if (result.cancelled) {
        track("purchase_cancelled", {
          product: "cookbook",
          customerId: revenueCatUserId,
          ...(usingDiscount ? { discount: "pro_first" as const } : {}),
        });
        showToast("Purchase cancelled. Your cookbook is still here when you're ready.");
        return;
      }

      track("purchase_completed", {
        product: "cookbook",
        customerId: revenueCatUserId,
        ...(usingDiscount ? { discount: "pro_first" as const } : {}),
      });

      markCookbookUnlockPending(projectId);
      markCookbookProjectUnlockedLocal(projectId);
      setProjectUnlocked(true);
      // The durable record is the server's: RevenueCat fires the purchase event
      // at the webhook, which writes the unlock doc with the admin SDK. The
      // client used to write it here (with retries) because nothing else did —
      // that is exactly the hole this closed, since a write the client is
      // allowed to make is a write any signed-in user can make for free.
      //
      // Signed-out buying is still allowed: the purchase is recorded against the
      // anonymous RevenueCat id now and granted on the TRANSFER event when the
      // buyer signs in. Either way the local marker set above carries access on
      // this device in the meantime, so the buyer never sees "not purchased"
      // while the webhook lands.

      onFreshPurchase();
      onCookbookGranted(usingDiscount);
      onUnlocked(true);
    } catch (error) {
      // See the same catch in usePremiumTemplatePurchase: a charge that
      // clears upstream and then throws here left no event at all.
      track("purchase_failed", {
        product: "cookbook",
        reason: truncateReason(error),
        customerId: revenueCatUserId,
        ...(usingDiscount ? { discount: "pro_first" as const } : {}),
      });
      showToast(friendlyPurchaseSetupError(error));
    } finally {
      setCookbookPurchaseBusy(false);
    }
  }

  return {
    // Static fallback rather than the live RevenueCat price: with the paywall
    // dialog gone there's no pre-purchase surface to load it into, and loading
    // it eagerly would configure the SDK (minting a customer record) for anyone
    // who merely opens a cookbook. Checkout states the authoritative price —
    // this is just which fallback to show beforehand, picked the same way
    // `packageForCookbook` picks which product to actually buy.
    cookbookPrice: discountEligible ? COOKBOOK_DISCOUNT_PRICE_FALLBACK : COOKBOOK_PRICE_FALLBACK,
    cookbookLocked,
    cookbookAccessStatus,
    cookbookPurchaseBusy,
    purchaseCookbookAndContinue,
  };
}
