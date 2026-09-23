"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { track } from "@/lib/analytics";
import {
  forgetProUpgradeIntent,
  rememberProUpgradeIntent,
  takeProUpgradeIntent,
} from "@/lib/proUpgradeIntent";
import type { ProPlan } from "@/lib/proProduct";
import { loadRecipePrinterCustomerInfo } from "@/lib/recipePrinterPurchases";
import { useProPurchase } from "@/lib/useProPurchase";

/**
 * The Pro upgrade dialog for a page that has no editor of its own — the home
 * page's Recipe apps picker, and the SEO captures. `/print` owns the same
 * dialog inside its page component, wired to everything a print job knows
 * (which lock opened it, what to resume afterwards); this is the same dialog
 * and the same purchase flow with none of that, so choosing Pro from the
 * front door no longer sends anyone off to /account to find a different one.
 *
 * Sign-in is the one place this differs from a plain "choose then buy". A
 * signed-out cook picks a plan first, the dialog turns into sign-in, and
 * checkout must start for THAT plan once an account exists. The plan is
 * written down (`rememberProUpgradeIntent`) so it survives a phone's
 * sign-in redirect, and the effect below is the only thing that spends it,
 * whether the page was reloaded or not: the dialog's own `onChoose` fires a
 * beat before this hook has an account to buy for, so for a signed-out cook
 * it does nothing and leaves the intent to the effect.
 */
export function useStandaloneProUpgrade(trigger: string): {
  openProUpgrade: () => void;
  /** Render this once, anywhere in the tree. */
  proUpgradeDialog: ReactNode;
  /** Something the cook should be told — a cancelled or failed checkout. */
  proMessage: string | null;
  /** True from the moment Pro is confirmed active in this session. */
  proJustActivated: boolean;
} {
  const { user } = useCookPilotAuth();
  const uid = user?.uid ?? null;
  const [open, setOpen] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  /** Whose customer info `customerInfo` is, so a purchase never starts against
      the previous account's answer (or before there is one). */
  const [customerInfoUid, setCustomerInfoUid] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<ProPlan | null>(null);
  const [proMessage, setProMessage] = useState<string | null>(null);
  const [proJustActivated, setProJustActivated] = useState(false);

  const { proBusy, purchaseProAndContinue } = useProPurchase({
    revenueCatUserId: uid,
    customerInfo,
    acceptCustomerInfo: setCustomerInfo,
    cookPilotUser: user,
    showToast: setProMessage,
    clearToast: () => setProMessage(null),
  });

  // The entitlement read that `purchaseProAndContinue` checks first, so
  // choosing Pro on an account that already has it cannot start a second
  // checkout.
  useEffect(() => {
    if (!uid) {
      setCustomerInfo(null);
      setCustomerInfoUid(null);
      return;
    }
    let alive = true;
    loadRecipePrinterCustomerInfo(uid)
      .then((info) => {
        if (alive) setCustomerInfo(info);
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not load Pro status", error);
      })
      .finally(() => {
        if (alive) setCustomerInfoUid(uid);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  // A plan chosen before signing in, spent once there is an account. Covers the
  // popup sign-in and, on a phone, the page coming back from the redirect.
  useEffect(() => {
    if (!uid) return;
    const intent = takeProUpgradeIntent();
    if (intent) setPendingPlan(intent.plan);
  }, [uid]);

  // Checkout, once there is an account AND its entitlement has been read. Runs
  // from an effect so it sees this render's `customerInfo`, not the one the
  // dialog's callback closed over.
  useEffect(() => {
    if (!pendingPlan || !uid || customerInfoUid !== uid) return;
    setPendingPlan(null);
    void purchaseProAndContinue(pendingPlan, (outcome) => {
      setOpen(false);
      if (outcome === "purchased" || outcome === "already-active") setProJustActivated(true);
    });
    // `purchaseProAndContinue` is rebuilt every render; the values it reads are
    // this effect's own dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlan, uid, customerInfoUid]);

  const openProUpgrade = useCallback(() => {
    setProMessage(null);
    track("paywall_viewed", { trigger });
    setOpen(true);
  }, [trigger]);

  const proUpgradeDialog = open ? (
    <ProUpgradeDialog
      busy={proBusy}
      cookPilotUser={user}
      onClose={() => {
        // Closing after picking a plan but before finishing sign-in must drop
        // the stored intent, or signing in later for something unrelated
        // would launch a checkout for a plan nobody committed to.
        forgetProUpgradeIntent();
        setPendingPlan(null);
        setOpen(false);
      }}
      onSignInRequired={(plan) => rememberProUpgradeIntent(trigger, plan)}
      onChoose={(plan) => {
        // Signed out, this is the dialog reporting a successful sign-in before
        // the account has reached this hook. The intent is already stored and
        // the effect above spends it when it does.
        if (uid) setPendingPlan(plan);
      }}
    />
  ) : null;

  return { openProUpgrade, proUpgradeDialog, proMessage, proJustActivated };
}
