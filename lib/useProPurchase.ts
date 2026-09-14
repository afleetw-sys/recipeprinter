"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { track, truncateReason } from "@/lib/analytics";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import { hasProEntitlement, purchaseRecipePrinterPro } from "@/lib/recipePrinterPurchases";
import type { ProBillingCycle } from "@/lib/proProduct";

interface UseProPurchaseOptions {
  /** Shared with usePremiumTemplatePurchase — this hook reuses that hook's
      already-established RevenueCat identity rather than configuring the SDK
      a second time. */
  revenueCatUserId: string | null;
  customerInfo: CustomerInfo | null;
  /** Pushes the fresh `CustomerInfo` a purchase returns into the shared state
      `usePremiumTemplatePurchase` owns, so every other gate (theme lock, card
      size lock) sees the new Pro entitlement immediately. */
  setCustomerInfo: (info: CustomerInfo) => void;
  /** A successful purchase call is itself a live, successful RevenueCat
      verification — mark it as such the same way `usePremiumTemplatePurchase`
      does internally, so a fallback to the Firestore mirror never lingers
      past the moment a fresh purchase just proved the live SDK works. */
  markCustomerInfoVerified: () => void;
  cookPilotUser: User | null;
  showToast: (message: string) => void;
  clearToast: () => void;
  onFreshPurchase: () => void;
}

/**
 * How a purchase attempt concluded, so the caller can decide what to do next
 * without re-deriving it from a boolean. "purchased" and "already-active"
 * both mean "Pro is active now, proceed"; "cancelled" and "failed" both mean
 * "show what happened and go back to the editor" — a canceled checkout must
 * not strand the cook in a modal with no way forward.
 */
export type ProPurchaseOutcome = "purchased" | "already-active" | "cancelled" | "failed";

/**
 * Owns the RecipePrinter Pro subscription purchase. Mirrors
 * `useCookbookPurchase`'s "buy → hand control back to caller" shape rather
 * than `usePremiumTemplatePurchase`'s "buy → print directly" one, since Pro
 * (like cookbook, unlike a single template) can be the second of two gates
 * still standing after it clears (a locked card size AND a locked cookbook,
 * say) — the caller re-runs its own gate check rather than this hook
 * assuming printing is now unconditionally safe.
 */
export function useProPurchase({
  revenueCatUserId,
  customerInfo,
  setCustomerInfo,
  markCustomerInfoVerified,
  cookPilotUser,
  showToast,
  clearToast,
  onFreshPurchase,
}: UseProPurchaseOptions) {
  const [proBusy, setProBusy] = useState(false);

  /** Buys Pro, then hands control back to `onSettled` with the outcome —
   *  called for every ending (success, cancel, or failure), never just the
   *  happy path, so a caller can always close its dialog and return to the
   *  editor rather than leaving a canceled checkout stranded on screen.
   *  Checks the already-loaded entitlement first so choosing Pro twice in
   *  one session — or clicking through a stale dialog — can't start a second
   *  checkout for a subscription the customer already holds. */
  async function purchaseProAndContinue(
    cycle: ProBillingCycle,
    onSettled: (outcome: ProPurchaseOutcome) => void,
  ) {
    if (!revenueCatUserId) {
      showToast("Purchases aren't ready yet. Wait a moment, then try again.");
      onSettled("failed");
      return;
    }

    if (hasProEntitlement(customerInfo)) {
      onSettled("already-active");
      return;
    }

    setProBusy(true);
    clearToast();
    try {
      track("purchase_started", { product: "pro", cycle, customerId: revenueCatUserId });
      const result = await purchaseRecipePrinterPro({
        userId: revenueCatUserId,
        email: cookPilotUser?.email,
        cycle,
      });
      setCustomerInfo(result.customerInfo);
      markCustomerInfoVerified();

      if (result.cancelled) {
        track("purchase_cancelled", { product: "pro", cycle, customerId: revenueCatUserId });
        showToast("Checkout cancelled. Your recipe is still here.");
        onSettled("cancelled");
        return;
      }

      track("purchase_completed", { product: "pro", cycle, customerId: revenueCatUserId });

      if (!hasProEntitlement(result.customerInfo)) {
        showToast("Your purchase went through, but Pro isn't ready yet. Wait a moment, then try again.");
        onSettled("failed");
        return;
      }

      onFreshPurchase();
      onSettled("purchased");
    } catch (error) {
      // See the same catch in usePremiumTemplatePurchase/useCookbookPurchase:
      // a charge that clears upstream and then throws here would otherwise
      // leave no event at all.
      track("purchase_failed", {
        product: "pro",
        cycle,
        reason: truncateReason(error),
        customerId: revenueCatUserId,
      });
      showToast(friendlyPurchaseSetupError(error));
      onSettled("failed");
    } finally {
      setProBusy(false);
    }
  }

  return { proBusy, purchaseProAndContinue };
}
