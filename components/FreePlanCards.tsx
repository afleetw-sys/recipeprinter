"use client";

import { useState } from "react";
import { AccountImportAllowanceUsage } from "@/components/AccountImportAllowanceUsage";
import { SegmentedControl } from "@/components/Controls";
import { CheckIcon, CrownIcon, ICON_SIZE } from "@/components/icons";
import { track } from "@/lib/analytics";
import { PRO_ANNUAL_PRICE_FALLBACK, PRO_MONTHLY_PRICE_FALLBACK, type ProBillingCycle } from "@/lib/proProduct";
import { BASIC_BENEFITS, FREE_IMPORTS_BENEFIT, PRO_BENEFITS } from "@/lib/proUpgradeCopy";
import { useVisitorPrices } from "@/lib/visitorCurrency";

/**
 * Basic beside Pro, for someone on the free plan: Settings' Plan section,
 * signed in (`AccountProStatus`) or not (app/account/page.tsx), so the two
 * can't disagree about what Pro includes or costs. What Upgrade does is the
 * caller's: checkout for an account, sign-in first for a visitor.
 */
export function FreePlanCards({
  busy = false,
  onUpgrade,
}: {
  busy?: boolean;
  onUpgrade: (cycle: ProBillingCycle) => void;
}) {
  /** Only changes which price the Pro card quotes before you've bought
      anything — `ProUpgradeDialog` still has its own cycle picker once
      you're actually choosing. */
  const [billingCycle, setBillingCycle] = useState<ProBillingCycle>("monthly");
  const { label: price, annualSavingsPercent } = useVisitorPrices();

  return (
    <div className="mt-cp-3">
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-cp-3">
        {/* `h-full flex-col` on the card plus `flex-1` on the benefit
            list is what keeps both buttons on one baseline regardless
            of which list is longer — the grid already stretches both
            cards to the tallest one, this just decides where the slack
            inside each card goes. */}
        <div className="flex h-full flex-col border-line py-cp-3 sm:rounded-lg sm:border sm:p-cp-3">
          <h3 className="text-cp-body font-extrabold text-ink">Basic</h3>
          <p className="mt-1 text-cp-body font-bold text-ink-soft">Free</p>
          <ul className="mt-cp-2 flex flex-1 flex-col gap-cp-1">
            {BASIC_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-cp-2 text-cp-small text-ink-soft">
                <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                <div className="min-w-0 flex-1">
                  {benefit}
                  {/* The allowance's usage, under the line it counts
                      against, on the card for the plan you're on. */}
                  {benefit === FREE_IMPORTS_BENEFIT && <AccountImportAllowanceUsage />}
                </div>
              </li>
            ))}
          </ul>

          <button type="button" className="btn btn-primary btn-compact mt-cp-3 w-full" disabled>
            Your current plan
          </button>
        </div>
        <div className="flex h-full flex-col border-t border-line py-cp-3 sm:rounded-lg sm:border sm:p-cp-3">
          <div className="flex flex-wrap items-center justify-between gap-cp-2">
            <div className="flex items-center gap-2">
              <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
              <h3 className="text-cp-body font-extrabold text-ink">Pro</h3>
            </div>
            <SegmentedControl
              label="Billing cycle"
              className="segmented-control--compact"
              value={billingCycle}
              onChange={(cycle) => {
                setBillingCycle(cycle);
                track("pro_plan_selected", { cycle });
              }}
              options={[
                { id: "monthly", label: "Monthly" },
                { id: "annual", label: "Annual" },
              ]}
            />
          </div>
          {billingCycle === "annual" ? (
            <p className="mt-1 text-cp-body font-bold text-ink-soft">
              {price(PRO_ANNUAL_PRICE_FALLBACK)}{" "}
              <span className="pro-plan-card__note">· Save {annualSavingsPercent}%</span>
            </p>
          ) : (
            <p className="mt-1 text-cp-body font-bold text-ink-soft">{price(PRO_MONTHLY_PRICE_FALLBACK)}</p>
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
            disabled={busy}
            onClick={() => onUpgrade(billingCycle)}
          >
            {busy ? "Opening checkout…" : "Upgrade"}
          </button>
        </div>
      </div>
    </div>
  );
}
