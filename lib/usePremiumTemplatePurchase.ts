"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { RECIPE_PRINT_TEMPLATE_OPTIONS } from "@/lib/printTemplates";
import type { RecipePrintTemplate } from "@/types/recipe";
import { track } from "@/lib/analytics";
import { friendlyClaimError } from "@/lib/friendlyErrors";
import { isPremiumTemplate, type PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";
import {
  hasTemplateEntitlement,
  identifyRecipePrinterCustomer,
  loadRecipePrinterCustomerInfo,
  recipePrinterCustomerId,
  syncRecipePrinterCustomerAttributes,
} from "@/lib/recipePrinterPurchases";
import {
  claimFreeRecipePrinterTemplate,
  loadFreeTemplateStatus,
  type RecipePrinterFreeTemplateStatus,
} from "@/lib/recipePrinterFreeTemplateClaim";
import type { QueueItem } from "@/types/recipe";

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
}

/**
 * Owns RecipePrinter's RevenueCat customer identity: linking a RevenueCat
 * customer id (anonymous, then aliased to the CookPilot account on sign-in),
 * loading entitlements, and the one remaining way to unlock a locked
 * template without a Pro subscription — an eligible CookPilot member
 * claiming their one free template, which prints immediately once granted.
 * Buying a single template is retired; `useProPurchase` (a sibling hook)
 * owns the Pro subscription purchase that now covers every theme, reusing
 * the identity this hook establishes rather than duplicating it.
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
}: UsePremiumTemplatePurchaseOptions) {
  const [revenueCatUserId, setRevenueCatUserId] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
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

  const hasItems = (items?.length ?? 0) > 0;

  useEffect(() => {
    // Gated on having something to print. This only reads (or mints locally)
    // the anonymous id — it does not configure the SDK, so no RevenueCat
    // customer exists until there's a purchase, a claim, or a login. Wait for
    // Firebase's initial auth restore first so a signed-in browser does not
    // briefly load anonymous entitlements and mark owned templates as locked.
    if (!hasItems || !cookPilotAuthReady) return;

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
    // Keyed on WHETHER there is anything to print, not on the item list, and on
    // the uid rather than the User object.
    //
    // `items` is a useMemo that produces a new array on every queue change, and
    // the effect only ever asked it one question: is it empty? So every
    // blur-commit of an ingredient re-ran this — and for a signed-in cook that
    // means `identifyRecipePrinterCustomer` and a `getCustomerInfo()` round trip
    // to RevenueCat, per edit. The User object has the same problem more slowly:
    // Firebase hands `onAuthStateChanged` a fresh one on every token refresh
    // (roughly hourly), so an account that hadn't changed re-ran this too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotAuthReady, cookPilotUser?.uid, hasItems]);

  useEffect(() => {
    if (!revenueCatUserId) return;
    // Background refresh: prime entitlements so owned templates (and Pro)
    // show as owned. Failures here are silent on purpose — the user only
    // needs to hear about a problem if they actually try to claim a free
    // template or upgrade to Pro, which show their own clear toasts.
    refreshCustomerInfo(revenueCatUserId).catch((error) => {
      console.warn("RecipePrinter: could not refresh customer info", error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueCatUserId]);

  return {
    revenueCatUserId,
    customerInfo,
    // Exposed so `useProPurchase` (a sibling hook, not a duplicate identity/
    // SDK setup) can push the fresh `CustomerInfo` a Pro purchase returns
    // into this shared state, the same way this hook updates it internally
    // after a claim.
    setCustomerInfo,
    refreshCustomerInfo,
    claimBusy,
    freeTemplateBannerDismissed,
    setFreeTemplateBannerDismissed,
    selectedPremiumTemplate,
    selectedTemplateLabel,
    selectedTemplateLocked,
    hasUnclaimedFreeTemplate,
    canClaimSelectedTemplateFree,
    claimTemplateAndPrint,
  };
}
