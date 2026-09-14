"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ProBadge } from "@/components/ProBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { track } from "@/lib/analytics";
import {
  loadRecipePrinterCustomerInfo,
  proManagementUrl,
  proSubscriptionDetails,
} from "@/lib/recipePrinterPurchases";
import { useProPurchase } from "@/lib/useProPurchase";
import { resolveEffectiveCustomerInfo, type CustomerInfoLoadStatus } from "@/lib/proAccessFallback";
import { loadRecipePrinterUserProfile, type RecipePrinterMirroredEntitlement } from "@/lib/recipePrinterFreeTemplateClaim";

function planLabel(cycle: "monthly" | "annual" | null): string {
  if (cycle === "annual") return "Annual";
  if (cycle === "monthly") return "Monthly";
  return "Pro";
}

function formatDate(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The identity header, RecipePrinter Pro status/management, and the app's
 * only Sign out button — all of it lifted out of the old `AccountMenu`
 * dropdown onto `/account`, which is always its "open" state now that it's a
 * page section rather than a popover: every load-on-open gate that dropdown
 * had (`if (!open || !uid) return`) is just `if (!uid) return` here.
 */
export function AccountProStatus({ user }: { user: User }) {
  const uid = user.uid;
  const [proCustomerInfo, setProCustomerInfo] = useState<CustomerInfo | null>(null);
  const [proInfoStatus, setProInfoStatus] = useState<CustomerInfoLoadStatus>("idle");
  const [proInfoLastVerifiedAtMs, setProInfoLastVerifiedAtMs] = useState<number | null>(null);
  const [proMirroredEntitlements, setProMirroredEntitlements] =
    useState<Record<string, RecipePrinterMirroredEntitlement> | null>(null);
  const [proMirrorSyncedAtMs, setProMirrorSyncedAtMs] = useState<number | null>(null);
  const [proInfoLoading, setProInfoLoading] = useState(false);
  const [proMessage, setProMessage] = useState<string | null>(null);
  const [showProUpgradeDialog, setShowProUpgradeDialog] = useState(false);

  const refreshProCustomerInfo = useCallback(async () => {
    const [liveResult, mirrorResult] = await Promise.allSettled([
      loadRecipePrinterCustomerInfo(uid),
      loadRecipePrinterUserProfile(uid),
    ]);
    if (liveResult.status === "fulfilled") {
      setProCustomerInfo(liveResult.value);
      setProInfoStatus("ok");
      setProInfoLastVerifiedAtMs(Date.now());
    } else {
      console.warn("RecipePrinter: could not load live Pro status", liveResult.reason);
      setProInfoStatus("error");
    }
    if (mirrorResult.status === "fulfilled") {
      setProMirroredEntitlements(mirrorResult.value.mirroredEntitlements);
      setProMirrorSyncedAtMs(mirrorResult.value.syncedAtMs);
    } else {
      console.warn("RecipePrinter: could not load Pro status mirror", mirrorResult.reason);
    }
  }, [uid]);

  useEffect(() => {
    setProInfoLoading(true);
    void refreshProCustomerInfo().finally(() => setProInfoLoading(false));
  }, [refreshProCustomerInfo]);

  // `managementURL` opens RevenueCat's billing portal in a new tab, so there
  // is no in-app navigation to hook when the cook comes back from canceling
  // or changing plans. Refetch on refocus so the "active until {date}" line
  // updates without a manual reload.
  useEffect(() => {
    function onFocus() {
      void refreshProCustomerInfo();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshProCustomerInfo]);

  const effectiveProInfo = useMemo(
    () =>
      resolveEffectiveCustomerInfo({
        liveCustomerInfo: proCustomerInfo,
        liveStatus: proInfoStatus,
        liveLastVerifiedAtMs: proInfoLastVerifiedAtMs,
        mirroredEntitlements: proMirroredEntitlements,
        mirrorSyncedAtMs: proMirrorSyncedAtMs,
        nowMs: Date.now(),
      }),
    [proCustomerInfo, proInfoStatus, proInfoLastVerifiedAtMs, proMirroredEntitlements, proMirrorSyncedAtMs],
  );
  const proDetails = proSubscriptionDetails(effectiveProInfo.customerInfo);
  const proManagementLink = proManagementUrl(effectiveProInfo.customerInfo);

  const { proBusy, purchaseProAndContinue } = useProPurchase({
    revenueCatUserId: uid,
    customerInfo: effectiveProInfo.customerInfo,
    setCustomerInfo: setProCustomerInfo,
    markCustomerInfoVerified: () => {
      setProInfoStatus("ok");
      setProInfoLastVerifiedAtMs(Date.now());
    },
    cookPilotUser: user,
    showToast: setProMessage,
    clearToast: () => setProMessage(null),
    // No print/export action to return to from here — this is a standing
    // status surface, not something a purchase resumes into.
    onFreshPurchase: () => undefined,
  });

  return (
    <section className="mb-cp-7 rounded-xl border border-line bg-card p-cp-5">
      <div>
        <div className="flex items-center justify-between gap-cp-2">
          <h2 className="text-cp-small font-bold text-ink">Plan</h2>
          {proDetails.active && <ProBadge variant="inline" />}
        </div>
        {proInfoLoading ? (
          <p className="mt-1 text-cp-small text-ink-soft">Loading…</p>
        ) : effectiveProInfo.source === "none" && effectiveProInfo.stale ? (
          // A real RevenueCat/network failure with nothing to fall back on —
          // distinct from "Free plan" on purpose, so a temporary outage never
          // reads as having lost a subscription.
          <>
            <p className="mt-1 text-cp-small text-ink-soft">Couldn&rsquo;t load your subscription status.</p>
            <button
              type="button"
              className="btn btn-secondary btn-compact mt-cp-2 w-full sm:w-auto"
              onClick={() => void refreshProCustomerInfo()}
            >
              Retry
            </button>
          </>
        ) : proDetails.active ? (
          <>
            <p className="mt-1 text-cp-small text-ink-soft">{planLabel(proDetails.cycle)} plan</p>
            <p className="text-cp-small text-ink-soft">
              {proDetails.willRenew
                ? `Renews ${formatDate(proDetails.expiresAtMs) ?? "soon"}`
                : `Active through ${formatDate(proDetails.expiresAtMs) ?? "your paid period"}`}
            </p>
            {effectiveProInfo.source === "mirror-fallback" && (
              <p className="text-cp-small text-ink-soft">
                Showing your last verified plan
                {effectiveProInfo.lastVerifiedAtMs
                  ? ` (as of ${formatDate(effectiveProInfo.lastVerifiedAtMs) ?? "recently"})`
                  : ""}
                .
              </p>
            )}
            {/* Prominent on purpose — cancellation must not be hard to find.
                This opens RevenueCat's own hosted billing portal; there is no
                custom cancel flow to build or maintain. */}
            <button
              type="button"
              className="btn btn-secondary btn-compact mt-cp-2 w-full sm:w-auto"
              disabled={!proManagementLink}
              title={proManagementLink ? undefined : "Manage subscription isn't ready yet. Try again in a moment."}
              onClick={() => {
                if (!proManagementLink) return;
                track("manage_subscription_clicked", {});
                window.open(proManagementLink, "_blank", "noopener,noreferrer");
              }}
            >
              Manage subscription
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-cp-small text-ink-soft">Free plan</p>
            <button
              type="button"
              className="btn btn-primary btn-compact mt-cp-2 w-full sm:w-auto"
              onClick={() => {
                track("paywall_viewed", { trigger: "account_menu" });
                setShowProUpgradeDialog(true);
              }}
            >
              Upgrade to Pro
            </button>
          </>
        )}
        {proMessage && <p className="mt-1 text-cp-small text-ink-soft">{proMessage}</p>}
      </div>

      <div className="mt-cp-4 border-t border-line pt-cp-3">
        <button
          type="button"
          className="btn-ghost btn-compact w-full sm:w-auto"
          onClick={() => void signOut(getFirebaseAuth())}
        >
          Sign out
        </button>
      </div>

      {showProUpgradeDialog && (
        <ProUpgradeDialog
          busy={proBusy}
          cookPilotUser={user}
          onClose={() => setShowProUpgradeDialog(false)}
          onChoose={(cycle) => void purchaseProAndContinue(cycle, () => setShowProUpgradeDialog(false))}
        />
      )}
    </section>
  );
}
