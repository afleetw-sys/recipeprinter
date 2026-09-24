"use client";

import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { track, truncateReason } from "@/lib/analytics";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import {
  hasProEntitlement,
  loadRecipePrinterCustomerInfo,
  purchaseRecipePrinterPro,
  waitForProEntitlement,
} from "@/lib/recipePrinterPurchases";
import { buysOneMonth, type ProPlan } from "@/lib/proProduct";

interface UseProPurchaseOptions {
  /** Shared with usePremiumTemplatePurchase — this hook reuses that hook's
      already-established RevenueCat identity rather than configuring the SDK
      a second time. */
  revenueCatUserId: string | null;
  customerInfo: CustomerInfo | null;
  /** Takes the fresh `CustomerInfo` a purchase returns, so every other gate
      (theme lock, card size lock) sees the new Pro entitlement immediately.
      It is also a live, successful RevenueCat read, so an owner that falls
      back to the Firestore mirror should record it as verified. */
  acceptCustomerInfo: (info: CustomerInfo) => void;
  cookPilotUser: User | null;
  showToast: (message: string) => void;
  /** For a failure the cook needs to notice; falls back to `showToast`. */
  showErrorToast?: (message: string) => void;
  clearToast: () => void;
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
  acceptCustomerInfo,
  cookPilotUser,
  showToast,
  showErrorToast = showToast,
  clearToast,
}: UseProPurchaseOptions) {
  const [proBusy, setProBusy] = useState(false);
  // State lags a render behind; this doesn't. Two starts in the same tick (a
  // sign-in that both calls `onChoose` and resumes a stored intent) must not
  // open two checkouts.
  const inFlightRef = useRef(false);

  /** Buys Pro, then hands control back to `onSettled` with the outcome —
   *  called for every ending (success, cancel, or failure), never just the
   *  happy path, so a caller can always close its dialog and return to the
   *  editor rather than leaving a canceled checkout stranded on screen.
   *  Checks the already-loaded entitlement first so choosing Pro twice in
   *  one session — or clicking through a stale dialog — can't start a second
   *  checkout for a subscription the customer already holds. */
  async function purchaseProAndContinue(
    plan: ProPlan,
    onSettled: (outcome: ProPurchaseOutcome) => void,
  ) {
    const { cycle } = plan;
    if (!revenueCatUserId) {
      showToast("Purchases aren't ready yet. Wait a moment, then try again.");
      onSettled("failed");
      return;
    }

    if (inFlightRef.current) return;
    if (hasProEntitlement(customerInfo)) {
      onSettled("already-active");
      return;
    }

    inFlightRef.current = true;
    setProBusy(true);
    clearToast();
    try {
      // Ask RevenueCat, not the last answer we were handed: that one can be
      // stale, most dangerously right after a one-month purchase whose
      // webhook grant landed after `waitForProEntitlement` stopped looking,
      // where buying again would charge for a second month. A failed read is
      // no answer, so checkout goes ahead exactly as it did before.
      const fresh = await loadRecipePrinterCustomerInfo(revenueCatUserId).catch(() => null);
      if (fresh && hasProEntitlement(fresh)) {
        acceptCustomerInfo(fresh);
        onSettled("already-active");
        return;
      }

      track("purchase_started", {
        product: "pro",
        cycle,
        auto_renew: plan.autoRenew,
        customerId: revenueCatUserId,
      });
      const result = await purchaseRecipePrinterPro({
        userId: revenueCatUserId,
        email: cookPilotUser?.email,
        plan,
      });
      acceptCustomerInfo(result.customerInfo);

      if (result.cancelled) {
        track("purchase_cancelled", { product: "pro", cycle, customerId: revenueCatUserId });
        showToast("Checkout cancelled. Your recipe is still here.");
        onSettled("cancelled");
        return;
      }

      track("purchase_completed", { product: "pro", cycle, customerId: revenueCatUserId });

      // A month bought on its own grants nothing at checkout: CookPilot's
      // webhook turns it into Pro a moment later.
      let settledInfo = result.customerInfo;
      if (buysOneMonth(plan)) {
        settledInfo = await waitForProEntitlement(revenueCatUserId);
        acceptCustomerInfo(settledInfo);
      }

      if (!hasProEntitlement(settledInfo)) {
        // Not "try again": buying again is exactly what must not happen here.
        // The fresh read above now catches the grant when it lands.
        showErrorToast("Your purchase went through. Pro can take a minute to switch on, so reload the page shortly.");
        onSettled("failed");
        return;
      }

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
      showErrorToast(friendlyPurchaseSetupError(error));
      onSettled("failed");
    } finally {
      inFlightRef.current = false;
      setProBusy(false);
    }
  }

  return { proBusy, purchaseProAndContinue };
}
