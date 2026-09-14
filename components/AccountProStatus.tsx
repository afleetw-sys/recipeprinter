"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { CheckIcon, CrownIcon, ICON_SIZE } from "@/components/icons";
import { ProBadge } from "@/components/ProBadge";
import { SegmentedControl } from "@/components/Controls";
import { PRO_BENEFITS, ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { track } from "@/lib/analytics";
import {
  loadRecipePrinterCustomerInfo,
  proManagementUrl,
  proSubscriptionDetails,
} from "@/lib/recipePrinterPurchases";
import { useProPurchase } from "@/lib/useProPurchase";
import { resolveEffectiveCustomerInfo, type CustomerInfoLoadStatus } from "@/lib/proAccessFallback";
import { loadRecipePrinterUserProfile, type RecipePrinterMirroredEntitlement } from "@/lib/recipePrinterFreeTemplateClaim";
import {
  PRO_ANNUAL_PRICE_FALLBACK,
  PRO_MONTHLY_PRICE_FALLBACK,
  PRO_PRICE_FALLBACKS,
  proAnnualPriceAtMonthlyRate,
  proAnnualSavingsPercent,
  type ProBillingCycle,
} from "@/lib/proProduct";

// What Basic (the free tier) actually includes — and it's a lot, which the
// old "Classic & Pantry themes / Full Page printing / one recipe at a time"
// list undersold by leading with a limitation. "Import from any site" /
// "Import from Instagram, TikTok..." / "Unlimited imports" were three lines
// making the same point (importing has no limit); folded into two by saying
// "Unlimited" on each rather than splitting it out as its own line.
// "One recipe at a time" is real (see PrintSetupControls.tsx's "This
// recipe" title) but it's a constraint, not a benefit, so it doesn't belong
// on a list meant to make the case for staying on Basic being a perfectly
// good deal.
const BASIC_BENEFITS = [
  "Unlimited imports from any recipe website",
  "Unlimited imports from Instagram, TikTok, Pinterest & more",
  "Letter-size printing with two free themes",
];

function formatDate(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * RecipePrinter Plan status/management — lifted out of the old `AccountMenu`
 * dropdown onto `/account`, which is always its "open" state now that it's a
 * page section rather than a popover: every load-on-open gate that dropdown
 * had (`if (!open || !uid) return`) is just `if (!uid) return` here.
 *
 * Sign out lives on its own, directly in app/account/page.tsx — it isn't
 * part of your plan, it's part of your session, and grouping it under "Plan"
 * read as if ending your session were a billing action.
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
  /** Only changes which price the Pro card quotes before you've bought
      anything — `ProUpgradeDialog` still has its own cycle picker once
      you're actually choosing. */
  const [billingCycle, setBillingCycle] = useState<ProBillingCycle>("annual");

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
          <h2 className="text-cp-h2 font-extrabold text-ink">Plan</h2>
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
          <div className="mt-cp-3">
            {effectiveProInfo.source === "mirror-fallback" && (
              <p className="mb-cp-2 text-cp-small text-ink-soft">
                Showing your last verified plan
                {effectiveProInfo.lastVerifiedAtMs
                  ? ` (as of ${formatDate(effectiveProInfo.lastVerifiedAtMs) ?? "recently"})`
                  : ""}
                .
              </p>
            )}

            {/* Same two cards a not-yet-subscriber sees, kept on purpose —
                the benefit lists are still the reminder of what this plan is
                worth, not just a receipt. The Pro card gets a low-opacity
                tint so the active plan is the one your eye lands on, and it's
                now the only place a subscription action lives: renewal date
                and price sit right there, and the one button links straight
                out to actually manage or cancel it — no "Downgrade" button of
                ours that just opens a page where you press cancel again.
                Basic goes back to being a plain comparison card with nothing
                to click, since there's no action to start from that side
                while you're on Pro. */}
            <div className="grid gap-cp-3 sm:grid-cols-2">
              <div className="flex h-full flex-col rounded-lg border border-line p-cp-3">
                <h3 className="text-cp-body font-extrabold text-ink">Basic</h3>
                <p className="mt-1 text-cp-body font-bold text-ink-soft">Free</p>
                <ul className="mt-cp-2 flex flex-1 flex-col gap-cp-1">
                  {BASIC_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-cp-2 text-cp-small text-ink-soft">
                      <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex h-full flex-col rounded-lg border border-line bg-[var(--cp-premium-soft)] p-cp-3">
                <div className="flex items-center gap-2">
                  <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
                  <h3 className="text-cp-body font-extrabold text-ink">Pro</h3>
                </div>
                <p className="mt-1 text-cp-body font-bold text-ink-soft">
                  {proDetails.cycle ? PRO_PRICE_FALLBACKS[proDetails.cycle] : "Your plan"}
                </p>
                <p className="mt-1 text-cp-small font-bold text-ink">
                  {proDetails.willRenew
                    ? `Renews ${formatDate(proDetails.expiresAtMs) ?? "soon"}`
                    : `Ends ${formatDate(proDetails.expiresAtMs) ?? "at the end of your paid period"}`}
                </p>
                {!proDetails.willRenew && (
                  <p className="text-cp-small text-ink-soft">
                    You canceled, but you can pick Pro back up any time before then.
                  </p>
                )}
                <ul className="mt-cp-2 flex flex-1 flex-col gap-cp-1">
                  <li className="flex items-start gap-cp-2 text-cp-small font-semibold text-ink">
                    <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                    Everything in Basic
                  </li>
                  {PRO_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-cp-2 text-cp-small text-ink-soft">
                      <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                {proDetails.willRenew ? (
                  // Opens RevenueCat's own hosted billing portal, where
                  // canceling actually happens — there's no separate
                  // "Downgrade" step of ours in front of it anymore.
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact mt-cp-3 w-full"
                    disabled={!proManagementLink}
                    title={proManagementLink ? undefined : "Managing your subscription isn't ready yet. Try again in a moment."}
                    onClick={() => {
                      if (!proManagementLink) return;
                      track("manage_subscription_clicked", {});
                      window.open(proManagementLink, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Manage subscription
                  </button>
                ) : (
                  // Reuses the same purchase flow a first-time upgrade uses —
                  // there's no separate "undo cancellation" mechanism to
                  // build, and this one already knows how to pick a cycle
                  // and hand the result back here.
                  <button
                    type="button"
                    className="btn btn-primary btn-compact mt-cp-3 w-full"
                    onClick={() => {
                      track("paywall_viewed", { trigger: "account_menu" });
                      setShowProUpgradeDialog(true);
                    }}
                  >
                    Resubscribe
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          // A flat "Free plan" line with nothing under it answered the
          // status question honestly but sold nothing — the one place in the
          // app that should make the case for Pro to someone who hasn't
          // bought it yet was the quietest screen about it. Side by side so
          // the difference is what's on the Pro card, not a claim to take on
          // faith; the Pro list opens with "Everything in Basic" rather than
          // repeating the same three lines, and then the real benefit list
          // `ProUpgradeDialog` itself leads with, so this and the dialog it
          // opens never disagree about what Pro includes.
          <div className="mt-cp-3">
            <div className="grid gap-cp-3 sm:grid-cols-2">
              {/* `h-full flex-col` on the card plus `flex-1` on the benefit
                  list is what keeps both buttons on one baseline regardless
                  of which list is longer — the grid already stretches both
                  cards to the tallest one, this just decides where the slack
                  inside each card goes. */}
              <div className="flex h-full flex-col rounded-lg border border-line p-cp-3">
                <h3 className="text-cp-body font-extrabold text-ink">Basic</h3>
                <p className="mt-1 text-cp-body font-bold text-ink-soft">Free</p>
                <ul className="mt-cp-2 flex flex-1 flex-col gap-cp-1">
                  {BASIC_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-cp-2 text-cp-small text-ink-soft">
                      <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-primary btn-compact mt-cp-3 w-full" disabled>
                  Your current plan
                </button>
              </div>
              <div className="flex h-full flex-col rounded-lg border border-line p-cp-3">
                <div className="flex flex-wrap items-center justify-between gap-cp-2">
                  <div className="flex items-center gap-2">
                    <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
                    <h3 className="text-cp-body font-extrabold text-ink">Pro</h3>
                  </div>
                  <SegmentedControl
                    label="Billing cycle"
                    className="segmented-control--compact"
                    value={billingCycle}
                    onChange={setBillingCycle}
                    options={[
                      { id: "monthly", label: "Monthly" },
                      { id: "annual", label: "Annual" },
                    ]}
                  />
                </div>
                {billingCycle === "annual" ? (
                  <div className="mt-1">
                    {/* Same struck-through "was" price ProUpgradeDialog shows
                        for Annual — without it, this teaser and the dialog
                        it opens told two different stories about what
                        Annual saves. */}
                    <p className="pro-plan-card__price text-ink-soft">
                      <span className="pro-plan-card__price--was">{proAnnualPriceAtMonthlyRate()}</span>
                      {PRO_ANNUAL_PRICE_FALLBACK}
                    </p>
                    <p className="pro-plan-card__note">Save {proAnnualSavingsPercent()}% vs. monthly</p>
                  </div>
                ) : (
                  <p className="mt-1 text-cp-body font-bold text-ink-soft">{PRO_MONTHLY_PRICE_FALLBACK}</p>
                )}
                <ul className="mt-cp-2 flex flex-1 flex-col gap-cp-1">
                  <li className="flex items-start gap-cp-2 text-cp-small font-semibold text-ink">
                    <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                    Everything in Basic
                  </li>
                  {PRO_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-cp-2 text-cp-small text-ink-soft">
                      <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-primary btn-compact mt-cp-3 w-full"
                  onClick={() => {
                    track("paywall_viewed", { trigger: "account_menu" });
                    setShowProUpgradeDialog(true);
                  }}
                >
                  Upgrade
                </button>
              </div>
            </div>
          </div>
        )}
        {proMessage && <p className="mt-1 text-cp-small text-ink-soft">{proMessage}</p>}
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
