"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import {
  hasCookbookEntitlement,
  loadRecipePrinterCookbookPrice,
  purchaseRecipePrinterCookbook,
} from "@/lib/recipePrinterPurchases";

interface UseCookbookPurchaseOptions {
  /** Shared with usePremiumTemplatePurchase so this doesn't re-run RevenueCat
      identify/link/configure a second time for the same browser session. */
  revenueCatUserId: string | null;
  customerInfo: CustomerInfo | null;
  cookPilotUser: User | null;
  cookbookMode: boolean;
  refreshCustomerInfo: (userId?: string | null) => Promise<CustomerInfo | null>;
  showToast: (message: string) => void;
  clearToast: () => void;
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
  refreshCustomerInfo,
  showToast,
  clearToast,
}: UseCookbookPurchaseOptions) {
  const [cookbookPrice, setCookbookPrice] = useState<string | undefined>(undefined);
  const [showCookbookUnlockDialog, setShowCookbookUnlockDialog] = useState(false);
  const [cookbookPurchaseBusy, setCookbookPurchaseBusy] = useState(false);

  const cookbookUnlocked = hasCookbookEntitlement(customerInfo);
  const cookbookLocked = cookbookMode && !cookbookUnlocked;

  useEffect(() => {
    if (!revenueCatUserId) return;
    loadRecipePrinterCookbookPrice(revenueCatUserId)
      .then(setCookbookPrice)
      .catch(() => setCookbookPrice(undefined));
  }, [revenueCatUserId]);

  /** Buys the cookbook entitlement, then hands control back to `onUnlocked`
      (typically re-running the export/print gate) rather than printing
      directly — the caller may still have a locked premium template to
      resolve after this purchase clears. */
  async function purchaseCookbookAndContinue(onUnlocked: () => void) {
    if (!revenueCatUserId) {
      showToast("Purchase service is still getting ready. Try again in a moment.");
      return;
    }

    setCookbookPurchaseBusy(true);
    clearToast();
    try {
      const latestInfo = customerInfo ?? (await refreshCustomerInfo(revenueCatUserId));
      if (hasCookbookEntitlement(latestInfo)) {
        setShowCookbookUnlockDialog(false);
        onUnlocked();
        return;
      }

      const result = await purchaseRecipePrinterCookbook({
        userId: revenueCatUserId,
        email: cookPilotUser?.email,
      });

      if (result.cancelled) {
        showToast("Purchase cancelled. Your cookbook is still here when you're ready.");
        return;
      }

      if (!hasCookbookEntitlement(result.customerInfo)) {
        showToast("Purchase finished, but it's still syncing. Try again in a moment.");
        return;
      }

      setShowCookbookUnlockDialog(false);
      onUnlocked();
    } catch (error) {
      showToast(friendlyPurchaseSetupError(error));
    } finally {
      setCookbookPurchaseBusy(false);
    }
  }

  return {
    cookbookPrice: cookbookPrice ?? COOKBOOK_PRICE_FALLBACK,
    cookbookLocked,
    showCookbookUnlockDialog,
    setShowCookbookUnlockDialog,
    cookbookPurchaseBusy,
    purchaseCookbookAndContinue,
  };
}
