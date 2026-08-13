"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import { track } from "@/lib/analytics";
import {
  hasCookbookEntitlement,
  purchaseRecipePrinterCookbook,
} from "@/lib/recipePrinterPurchases";
import {
  claimLegacyCookbookUnlock,
  hasAnyCookbookProjectUnlock,
  isCookbookProjectUnlocked,
  loadCookbookProjectUnlock,
  markCookbookProjectUnlockedLocal,
  markCookbookUnlockPending,
  markProjectScopedCookbookPurchase,
  pendingCookbookUnlock,
  persistCookbookProjectUnlock,
} from "@/lib/cookbookUnlocks";

/**
 * Writes the unlock to Firestore, retrying a transient failure a few times
 * before giving up. On the final failure it stays quiet: the local unlock
 * marker is already set (inside `persistCookbookProjectUnlock`) and the
 * projects-page reconciler re-attempts the write on the next authenticated
 * visit, so the buyer is never shown a "not purchased" state.
 */
async function persistCookbookUnlockWithRetry(
  uid: string,
  projectId: string,
  attempts = 3,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await persistCookbookProjectUnlock(uid, projectId);
      return;
    } catch {
      if (attempt === attempts - 1) return;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
}

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
    const locallyUnlocked = isCookbookProjectUnlocked(projectId);
    setProjectUnlocked(locallyUnlocked);
    if (!cookPilotUser) {
      setResolvedUnlockKey(null);
      return;
    }
    const key = `${cookPilotUser.uid}:${projectId}`;
    if (locallyUnlocked) {
      setResolvedUnlockKey(key);
      return;
    }
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
  }, [cookPilotUser, projectId]);

  // One-time compatibility bridge for customers who bought the legacy
  // account-wide cookbook unlock before projects became individually owned.
  useEffect(() => {
    if (projectUnlocked || !hasCookbookEntitlement(customerInfo)) return;
    const pending = pendingCookbookUnlock();
    if (pending === projectId) {
      markCookbookProjectUnlockedLocal(projectId);
      setProjectUnlocked(true);
      if (cookPilotUser) void persistCookbookProjectUnlock(cookPilotUser.uid, projectId);
      return;
    }
    if (!cookPilotUser) {
      if (claimLegacyCookbookUnlock(projectId)) setProjectUnlocked(true);
      return;
    }
    let cancelled = false;
    hasAnyCookbookProjectUnlock(cookPilotUser.uid)
      .then((hasProjectUnlock) => {
        if (cancelled || hasProjectUnlock || !claimLegacyCookbookUnlock(projectId)) return;
        setProjectUnlocked(true);
        void persistCookbookProjectUnlock(cookPilotUser.uid, projectId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cookPilotUser, customerInfo, projectId, projectUnlocked]);

  // A missing local marker is not evidence that an account-owned cookbook is
  // either locked OR unlocked. Keep access tri-state until the project-scoped
  // Firestore check answers, so neither the paid workspace nor its paywall can
  // render based on a guess.
  const cookbookUnlockLoading = Boolean(
    cookbookMode && cookPilotUser && !projectUnlocked && resolvedUnlockKey !== unlockKey,
  );
  const cookbookAccessStatus: "loading" | "unlocked" | "locked" =
    !cookbookMode || projectUnlocked
      ? "unlocked"
      : cookbookUnlockLoading
        ? "loading"
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
      markProjectScopedCookbookPurchase(projectId);
      markCookbookProjectUnlockedLocal(projectId);
      setProjectUnlocked(true);
      // Signed-out buying is allowed, so an owner isn't guaranteed here. When we
      // do have one, land the unlock in Firestore — with retries — before
      // calling the purchase done, rather than the old fire-once-and-swallow.
      // Signed-out, the local marker holds it until the adopt-on-sign-in path
      // (adoptAnonymousProject) backs it up under the new account.
      if (cookPilotUser) {
        await persistCookbookUnlockWithRetry(cookPilotUser.uid, projectId);
      }

      onFreshPurchase();
      onUnlocked(true);
    } catch (error) {
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
