"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
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
  customerInfo: CustomerInfo | null;
  cookPilotUser: User | null;
  cookbookMode: boolean;
  projectId: string;
  refreshCustomerInfo: (userId?: string | null) => Promise<CustomerInfo | null>;
  showToast: (message: string) => void;
  clearToast: () => void;
  onFreshPurchase: () => void;
}

/**
 * Owns the "make it a cookbook" paywall: whether the cookbook upgrade is
 * already unlocked for this customer, its live RevenueCat price, and the
 * purchase flow triggered at export time (mirrors
 * usePremiumTemplatePurchase's unlock-then-continue shape, one entitlement
 * for the whole cookbook experience instead of per-template).
 */
export function useCookbookPurchase({
  revenueCatUserId,
  customerInfo,
  cookPilotUser,
  cookbookMode,
  projectId,
  refreshCustomerInfo,
  showToast,
  clearToast,
  onFreshPurchase,
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

     It is deleted rather than repaired because it protects nobody.
     `COOKBOOK_ENABLED` has only ever been true on the `cookbook` branch, never
     on the default branch, so the cookbook has never been publicly purchasable
     and no customer can hold the former account-wide unlock. Entitlement is now
     one thing only: a server-written unlock document. */

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
    try {
      if (isCookbookProjectUnlocked(projectId)) {
        setProjectUnlocked(true);
        onUnlocked(false);
        return;
      }

      track("purchase_started", { product: "cookbook" });
      const result = await purchaseRecipePrinterCookbook({
        userId: revenueCatUserId,
        email: cookPilotUser?.email,
        projectId,
      });

      if (result.cancelled) {
        track("purchase_cancelled", { product: "cookbook" });
        showToast("Purchase cancelled. Your cookbook is still here when you're ready.");
        return;
      }

      track("purchase_completed", { product: "cookbook" });

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
      onUnlocked(true);
    } catch (error) {
      // See the same catch in usePremiumTemplatePurchase: a charge that
      // clears upstream and then throws here left no event at all.
      track("purchase_failed", { product: "cookbook", reason: truncateReason(error) });
      showToast(friendlyPurchaseSetupError(error));
    } finally {
      setCookbookPurchaseBusy(false);
    }
  }

  return {
    // Static fallback rather than the live RevenueCat price: with the paywall
    // dialog gone there's no pre-purchase surface to load it into, and loading
    // it eagerly would configure the SDK (minting a customer record) for anyone
    // who merely opens a cookbook. Checkout states the authoritative price.
    cookbookPrice: COOKBOOK_PRICE_FALLBACK,
    cookbookLocked,
    cookbookAccessStatus,
    cookbookPurchaseBusy,
    purchaseCookbookAndContinue,
  };
}
