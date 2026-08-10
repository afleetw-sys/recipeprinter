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

  useEffect(() => {
    setProjectUnlocked(isCookbookProjectUnlocked(projectId));
    if (!cookPilotUser) return;
    loadCookbookProjectUnlock(cookPilotUser.uid, projectId)
      .then((unlocked) => setProjectUnlocked(unlocked))
      .catch(() => undefined);
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

  const cookbookLocked = cookbookMode && !projectUnlocked;

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
      if (cookPilotUser) {
        try {
          await persistCookbookProjectUnlock(cookPilotUser.uid, projectId);
        } catch {
          // The local pending marker prevents another charge and the
          // reconciliation effect retries on the next authenticated visit.
        }
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
    cookbookPurchaseBusy,
    purchaseCookbookAndContinue,
  };
}
