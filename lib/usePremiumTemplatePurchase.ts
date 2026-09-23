"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import type { RecipePrintTemplate } from "@/types/recipe";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
import {
  identifyRecipePrinterCustomer,
  loadRecipePrinterCustomerInfo,
  recipePrinterCustomerId,
  syncRecipePrinterCustomerAttributes,
} from "@/lib/recipePrinterPurchases";
import type { CustomerInfoLoadStatus } from "@/lib/proAccessFallback";
import type { QueueItem } from "@/types/recipe";

interface UsePremiumTemplatePurchaseOptions {
  items: QueueItem[] | null;
  cookPilotUser: User | null;
  cookPilotAuthReady: boolean;
  template: RecipePrintTemplate;
  showToast: (message: string) => void;
  /** For a failure the cook needs to notice; falls back to `showToast`. */
  showErrorToast?: (message: string) => void;
}

/**
 * Owns RecipePrinter's RevenueCat customer identity: linking a RevenueCat
 * customer id (anonymous, then aliased to the CookPilot account on sign-in),
 * and loading entitlements. Buying a single template is retired;
 * `useProPurchase` (a sibling hook) owns the Pro subscription purchase that
 * now covers every theme, reusing the identity this hook establishes rather
 * than duplicating it.
 */
export function usePremiumTemplatePurchase({
  items,
  cookPilotUser,
  cookPilotAuthReady,
  template,
  showToast,
  showErrorToast = showToast,
}: UsePremiumTemplatePurchaseOptions) {
  const [revenueCatUserId, setRevenueCatUserId] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  // Whether the last attempt to read RevenueCat's live state for the current
  // identity actually succeeded — distinct from `customerInfo` being null,
  // which by itself doesn't say whether that's "confirmed: owns nothing" or
  // "we couldn't ask." This is what lets a caller fall back to the Firestore
  // mirror only on a genuine failure, never on a confirmed empty answer (see
  // lib/proAccessFallback.ts's `resolveEffectiveCustomerInfo`).
  const [customerInfoStatus, setCustomerInfoStatus] = useState<CustomerInfoLoadStatus>("idle");
  const [customerInfoLastVerifiedAtMs, setCustomerInfoLastVerifiedAtMs] = useState<number | null>(null);
  const linkedCookPilotUidRef = useRef<string | null>(null);
  const revenueCatUserIdRef = useRef<string | null>(null);
  const identityRequestRef = useRef(0);

  function setRevenueCatIdentity(userId: string) {
    if (revenueCatUserIdRef.current !== userId) {
      setCustomerInfo(null);
      // A new identity hasn't been checked yet — not a failure, just unknown
      // until the next fetch resolves.
      setCustomerInfoStatus("idle");
    }
    revenueCatUserIdRef.current = userId;
    setRevenueCatUserId(userId);
  }

  const selectedPremiumTemplate = isPremiumTemplate(template) ? template : null;

  async function refreshCustomerInfo(userId: string): Promise<CustomerInfo | null> {
    let info: CustomerInfo | null;
    try {
      info = await loadRecipePrinterCustomerInfo(userId);
    } catch (error) {
      // A real failure to reach RevenueCat — not "this customer owns
      // nothing," which resolves normally below. Leave `customerInfo` at
      // whatever it already was (an already-verified paying user shouldn't
      // lose access just because this one check couldn't complete) and only
      // record that the live check itself failed, so a caller can fall back
      // to the Firestore mirror instead of reading a stale "no entitlement."
      if (revenueCatUserIdRef.current === userId) {
        setCustomerInfoStatus("error");
      }
      throw error;
    }
    // null means this browser has never bought, claimed, or signed in — a
    // confirmed "nothing," not a failure, so there is no customer to read or
    // annotate (creating one just to write attributes is the leak this gate
    // exists to stop) — but it's still a successful check.
    if (!info) {
      if (revenueCatUserIdRef.current === userId) {
        setCustomerInfoStatus("ok");
        setCustomerInfoLastVerifiedAtMs(Date.now());
      }
      return null;
    }
    syncRecipePrinterCustomerAttributes(userId).catch((error) => {
      console.warn("RecipePrinter: could not sync RevenueCat customer attributes", error);
    });
    if (revenueCatUserIdRef.current === userId) {
      setCustomerInfo(info);
      setCustomerInfoStatus("ok");
      setCustomerInfoLastVerifiedAtMs(Date.now());
    }
    return info;
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
        setCustomerInfoStatus("ok");
        setCustomerInfoLastVerifiedAtMs(Date.now());
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
        setCustomerInfoStatus("error");
        showErrorToast("You're signed in, but we couldn't restore your purchases. Check your connection and try again.");
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
    customerInfoStatus,
    customerInfoLastVerifiedAtMs,
    // Exposed so `useProPurchase` (a sibling hook, not a duplicate identity/
    // SDK setup) can push the fresh `CustomerInfo` a Pro purchase returns
    // into this shared state, the same way this hook updates it internally
    // after a claim.
    setCustomerInfo,
    // Same reasoning as `setCustomerInfo` above: a Pro purchase's own
    // successful response is itself a live RevenueCat verification, so
    // `useProPurchase` marks it through this rather than reaching in to set
    // the two pieces of state directly.
    markCustomerInfoVerified: () => {
      setCustomerInfoStatus("ok");
      setCustomerInfoLastVerifiedAtMs(Date.now());
    },
    selectedPremiumTemplate,
  };
}
