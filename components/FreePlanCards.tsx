"use client";

import { useState } from "react";
import { AccountImportAllowanceUsage } from "@/components/AccountImportAllowanceUsage";
import { SegmentedControl } from "@/components/Controls";
import { CheckIcon, CrownIcon, ICON_SIZE } from "@/components/icons";
import { track } from "@/lib/analytics";
import { DEFAULT_PRO_CYCLE, PRO_MONTHLY_PRICE_FALLBACK, type ProBillingCycle } from "@/lib/proProduct";
import { BASIC_BENEFITS, FREE_IMPORTS_BENEFIT, PRO_BENEFITS } from "@/lib/proUpgradeCopy";
import { useVisitorPrices } from "@/lib/visitorCurrency";
import { BLACK_FRIDAY_PRO_MONTHLY_MONTHS, BLACK_FRIDAY_PRO_MONTHLY_PRICE, proCycleToOpenOn } from "@/lib/blackFriday";
import { useSaleLive } from "@/lib/useSaleLive";

/**
 * Free beside Pro, for someone on the free plan: Settings' Plan section,
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
  const [billingCycle, setBillingCycle] = useState<ProBillingCycle>(proCycleToOpenOn);
  const saleLive = useSaleLive();
  const { label: price, annualSavingsPercent, annualPerMonth, annualTotal } = useVisitorPrices();

  return (
    <div className="mt-cp-3">
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-cp-3">
        {/* `h-full flex-col` on the card plus `flex-1` on the benefit
            list is what keeps both buttons on one baseline regardless
            of which list is longer — the grid already stretches both
            cards to the tallest one, this just decides where the slack
            inside each card goes. */}
        <div className="flex h-full flex-col border-line py-cp-3 sm:rounded-lg sm:border sm:p-cp-3">
          <h3 className="text-cp-body font-extrabold text-ink">Free</h3>
          <p className="mt-1 text-cp-body font-bold text-ink-soft">$0</p>
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
              // The default plan first (Amelia, 2026-11-16).
              options={
                DEFAULT_PRO_CYCLE === "annual"
                  ? [
                      { id: "annual", label: "Annual" },
                      { id: "monthly", label: "Monthly" },
                    ]
                  : [
                      { id: "monthly", label: "Monthly" },
                      { id: "annual", label: "Annual" },
                    ]
              }
            />
          </div>
          {billingCycle === "annual" ? (
            <p className="mt-1 text-cp-body font-bold text-ink-soft">
              {annualPerMonth}/mo <span className="pro-plan-card__note">· Save {annualSavingsPercent}%</span>
              <span className="block text-cp-label font-normal">Billed yearly at {annualTotal}</span>
            </p>
          ) : saleLive ? (
            // The sale's intro price (lib/blackFriday.ts).
            <p className="mt-1 text-cp-body font-bold text-ink-soft">
              <s className="font-semibold">
                <span className="sr-only">Was </span>
                {price(PRO_MONTHLY_PRICE_FALLBACK)}
              </s>{" "}
              <span className="sr-only">now </span>
              {price(BLACK_FRIDAY_PRO_MONTHLY_PRICE)}/mo
              <span className="block text-cp-label font-normal">
                50% off your first {BLACK_FRIDAY_PRO_MONTHLY_MONTHS} months, then {price(PRO_MONTHLY_PRICE_FALLBACK)}.
              </span>
            </p>
          ) : (
            <p className="mt-1 text-cp-body font-bold text-ink-soft">{price(PRO_MONTHLY_PRICE_FALLBACK)}</p>
          )}
          <ul className="mt-cp-2 flex flex-1 flex-col gap-cp-1">
            <li className="flex items-start gap-cp-2 text-cp-small font-semibold text-ink">
              <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
              Everything in Free
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
            {busy ? "Opening checkout…" : saleLive && billingCycle === "monthly" ? "Claim offer" : "Upgrade"}
          </button>
        </div>
      </div>
    </div>
  );
}
