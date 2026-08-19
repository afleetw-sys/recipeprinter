"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { RECIPE_PRINT_TEMPLATE_OPTIONS, type RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { track } from "@/lib/analytics";
import { friendlyClaimError, friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import { isPremiumTemplate, type PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";
import {
  hasTemplateEntitlement,
  identifyRecipePrinterCustomer,
  loadRecipePrinterCustomerInfo,
  purchaseRecipePrinterTemplate,
  recipePrinterCustomerId,
  syncRecipePrinterCustomerAttributes,
} from "@/lib/recipePrinterPurchases";
import {
  claimFreeRecipePrinterTemplate,
  loadFreeTemplateStatus,
  type RecipePrinterFreeTemplateStatus,
} from "@/lib/recipePrinterFreeTemplateClaim";
import type { QueueItem } from "@/types/recipe";

function friendlyPurchaseError(error: unknown): string {
  return friendlyPurchaseSetupError(error);
}

interface UsePremiumTemplatePurchaseOptions {
  items: QueueItem[] | null;
  cookPilotUser: User | null;
  cookPilotAuthReady: boolean;
  template: RecipePrintTemplate;
  freeTemplateStatus: RecipePrinterFreeTemplateStatus | null;
  setFreeTemplateStatus: (status: RecipePrinterFreeTemplateStatus | null) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  printNow: () => void;
  onFreshPurchase: () => void;
}

/**
 * Owns the RevenueCat premium-template purchase/claim flow: linking a
 * RevenueCat customer id (anonymous, then aliased to the CookPilot account on
 * sign-in), loading entitlements and prices, and the two paths to unlocking a
 * locked template (buy it, or claim the CookPilot-member free template) —
 * both of which print immediately once the template is confirmed unlocked.
 */
export function usePremiumTemplatePurchase({
  items,
  cookPilotUser,
  cookPilotAuthReady,
  template,
  freeTemplateStatus,
  setFreeTemplateStatus,
  showToast,
  clearToast,
  printNow,
  onFreshPurchase,
}: UsePremiumTemplatePurchaseOptions) {
  const [revenueCatUserId, setRevenueCatUserId] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [freeTemplateBannerDismissed, setFreeTemplateBannerDismissed] = useState(false);
  const linkedCookPilotUidRef = useRef<string | null>(null);
  const revenueCatUserIdRef = useRef<string | null>(null);
  const identityRequestRef = useRef(0);

  function setRevenueCatIdentity(userId: string) {
    if (revenueCatUserIdRef.current !== userId) {
      setCustomerInfo(null);
    }
    revenueCatUserIdRef.current = userId;
    setRevenueCatUserId(userId);
  }

  const selectedPremiumTemplate = isPremiumTemplate(template) ? template : null;
  const selectedTemplateOption = RECIPE_PRINT_TEMPLATE_OPTIONS.find(
    (option) => option.id === template,
  );
  const selectedTemplateLabel = selectedTemplateOption?.label ?? "this";
  const selectedTemplateLocked =
    selectedPremiumTemplate !== null &&
    !hasTemplateEntitlement(customerInfo, selectedPremiumTemplate);
  const hasUnclaimedFreeTemplate =
    Boolean(freeTemplateStatus?.cookPilotActive) && !freeTemplateStatus?.granted;
  const canClaimSelectedTemplateFree = selectedTemplateLocked && hasUnclaimedFreeTemplate;

  async function refreshCustomerInfo(userId = revenueCatUserId): Promise<CustomerInfo | null> {
    if (!userId) return null;
    const info = await loadRecipePrinterCustomerInfo(userId);
    // null means this browser has never bought, claimed, or signed in — so
    // there is no customer to read or annotate, and creating one just to
    // write attributes is the leak this gate exists to stop.
    if (!info) return null;
    syncRecipePrinterCustomerAttributes({
      userId,
    }).catch((error) => {
      console.warn("RecipePrinter: could not sync RevenueCat customer attributes", error);
    });
    if (revenueCatUserIdRef.current === userId) {
      setCustomerInfo(info);
    }
    return info;
  }

  async function unlockTemplateAndPrint(premiumTemplate: PremiumRecipePrintTemplate) {
    if (!revenueCatUserId) {
      showToast("Purchases aren't ready yet. Wait a moment, then try again.");
      return;
    }

    setPurchaseBusy(true);
    clearToast();
    try {
      const latestInfo = customerInfo ?? (await refreshCustomerInfo(revenueCatUserId));
      if (hasTemplateEntitlement(latestInfo, premiumTemplate)) {
        printNow();
        return;
      }

      track("purchase_started", { product: "premium_template", template: premiumTemplate });
      const result = await purchaseRecipePrinterTemplate({
        userId: revenueCatUserId,
        email: cookPilotUser?.email,
        template: premiumTemplate,
      });
      setCustomerInfo(result.customerInfo);

      if (result.cancelled) {
        track("purchase_cancelled", { product: "premium_template", template: premiumTemplate });
        showToast("Purchase cancelled. Your recipe cards are still here when you're ready.");
        return;
      }

      track("purchase_completed", { product: "premium_template", template: premiumTemplate });

      if (!hasTemplateEntitlement(result.customerInfo, premiumTemplate)) {
        showToast("Your purchase went through, but the template isn't ready yet. Wait a moment, then tap Print again.");
        return;
      }

      onFreshPurchase();
      printNow();
    } catch (error) {
      showToast(friendlyPurchaseError(error));
    } finally {
      setPurchaseBusy(false);
    }
  }

  async function claimTemplateAndPrint(premiumTemplate: PremiumRecipePrintTemplate) {
    if (!cookPilotUser) return;

    setClaimBusy(true);
    clearToast();
    try {
      await claimFreeRecipePrinterTemplate(premiumTemplate);
      const [status] = await Promise.all([
        loadFreeTemplateStatus(cookPilotUser.uid).then((result) => {
          setFreeTemplateStatus(result);
          return result;
        }),
        refreshCustomerInfo(),
      ]);

      if (!status.grantedConfirmed) {
        showToast("Your template is almost ready. Wait a moment, then tap Print again.");
        return;
      }

      track("free_template_claimed", { template: premiumTemplate });

      printNow();
    } catch (error) {
      showToast(friendlyClaimError(error));
    } finally {
      setClaimBusy(false);
    }
  }

  useEffect(() => {
    // Gated on having something to print. This only reads (or mints locally)
    // the anonymous id — it does not configure the SDK, so no RevenueCat
    // customer exists until there's a purchase, a claim, or a login. Wait for
    // Firebase's initial auth restore first so a signed-in browser does not
    // briefly load anonymous entitlements and mark owned templates as locked.
    if (!items || items.length === 0 || !cookPilotAuthReady) return;

    const requestId = identityRequestRef.current + 1;
    identityRequestRef.current = requestId;
    let cancelled = false;

    if (!cookPilotUser) {
      recipePrinterCustomerId()
        .then((userId) => {
          if (cancelled || identityRequestRef.current !== requestId) return;
          setRevenueCatIdentity(userId);
        })
        .catch((error) => {
          console.warn("RecipePrinter: could not initialize RevenueCat customer", error);
        });
      return () => {
        cancelled = true;
      };
    }

    // Runs once per CookPilot login: aliases whatever this browser already
    // purchased anonymously into the CookPilot account, then switches this
    // session to that identity so future purchases stay tied to it too.
    const uid = cookPilotUser.uid;
    const alreadyLinkedInSession = linkedCookPilotUidRef.current === uid;
    linkedCookPilotUidRef.current = uid;
    identifyRecipePrinterCustomer(uid)
      .then(({ customerInfo: linkedInfo, alreadyLinked }) => {
        if (cancelled || identityRequestRef.current !== requestId) return;
        setRevenueCatIdentity(uid);
        setCustomerInfo(linkedInfo);
        // Already linked in a prior visit (this is a page refresh, not a
        // fresh sign-in) — restoring entitlements silently is enough, the
        // toast would just be noise every time the page reloads.
        if (alreadyLinked || alreadyLinkedInSession) return;
        const hasAnyPremium = Object.keys(linkedInfo.entitlements.active).length > 0;
        if (!hasAnyPremium) {
          showToast("Signed in — no prior purchases found on this account.");
        }
      })
      .catch((error) => {
        if (cancelled || identityRequestRef.current !== requestId) return;
        console.warn("RecipePrinter: could not link CookPilot account to purchases", error);
        showToast("You're signed in, but we couldn't restore your purchases. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotAuthReady, cookPilotUser, items]);

  useEffect(() => {
    if (!revenueCatUserId) return;
    // Background refresh: prime entitlements so owned templates show as owned.
    // Failures here are silent on purpose — the user only needs to hear about a
    // problem if they actually try to unlock/print a premium template, which is
    // handled with a clear toast in unlockTemplateAndPrint.
    refreshCustomerInfo(revenueCatUserId).catch((error) => {
      console.warn("RecipePrinter: could not refresh customer info", error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueCatUserId]);

  return {
    revenueCatUserId,
    customerInfo,
    purchaseBusy,
    claimBusy,
    freeTemplateBannerDismissed,
    setFreeTemplateBannerDismissed,
    selectedPremiumTemplate,
    selectedTemplateLabel,
    selectedTemplateLocked,
    hasUnclaimedFreeTemplate,
    canClaimSelectedTemplateFree,
    refreshCustomerInfo,
    unlockTemplateAndPrint,
    claimTemplateAndPrint,
  };
}
