// RecipePrinter Pro — the subscription that replaced individual theme
// purchases. Unlocks every theme plus the premium recipe-card experience
// (card sizes beyond the free full page, batch printing, advanced layout and
// customization). Mirrors lib/cookbookProduct.ts's shape: RevenueCat
// offering/package/product identifiers as plain constants, no numeric price
// ids — RevenueCat resolves those against whatever is configured in its
// dashboard for this app's project.
//
// These identifiers must be created in RevenueCat's dashboard (the
// RecipePrinter project, not CookPilot's) before checkout can resolve a
// package: an offering "pro" with two packages, "pro_monthly" and
// "pro_annual", both product ids matching the package ids, both attached to
// a "pro" entitlement. That entitlement id must also match
// `RECIPEPRINTER_PRO_ENTITLEMENT_ID` in CookPilot's
// functions/src/recipePrinterRevenueCat.ts (separate repo, keep in sync by
// hand, same as the legacy template entitlements already are).
export const RECIPEPRINTER_PRO_OFFERING_ID = "pro";
export const RECIPEPRINTER_PRO_ENTITLEMENT_ID = "pro";

export type ProBillingCycle = "monthly" | "annual";

export const RECIPEPRINTER_PRO_PACKAGE_IDS = {
  monthly: "pro_monthly",
  annual: "pro_annual",
} as const satisfies Record<ProBillingCycle, string>;

export const RECIPEPRINTER_PRO_PRODUCT_IDS = {
  monthly: "pro_monthly",
  annual: "pro_annual",
} as const satisfies Record<ProBillingCycle, string>;

// One month of Pro that does not renew — what Monthly buys when "Continue Pro
// monthly" is unchecked. A non-renewing product in the same "pro" offering,
// attached to the same "pro" entitlement with a one-month duration, so it
// grants and expires Pro exactly the way a canceled monthly subscription
// does and every entitlement check stays as it is. Must exist in RevenueCat's
// dashboard before an unchecked Monthly can resolve a package.
export const RECIPEPRINTER_PRO_ONE_MONTH_PACKAGE_ID = "pro_one_month";
export const RECIPEPRINTER_PRO_ONE_MONTH_PRODUCT_ID = "pro_one_month";

/** What the upgrade dialog hands to checkout. `autoRenew` only ever changes
 *  anything for Monthly; Annual always renews. */
export interface ProPlan {
  cycle: ProBillingCycle;
  autoRenew: boolean;
}

function buysOneMonth({ cycle, autoRenew }: ProPlan): boolean {
  return cycle === "monthly" && !autoRenew;
}

export function proPackageId(plan: ProPlan): string {
  return buysOneMonth(plan) ? RECIPEPRINTER_PRO_ONE_MONTH_PACKAGE_ID : RECIPEPRINTER_PRO_PACKAGE_IDS[plan.cycle];
}

export function proProductId(plan: ProPlan): string {
  return buysOneMonth(plan) ? RECIPEPRINTER_PRO_ONE_MONTH_PRODUCT_ID : RECIPEPRINTER_PRO_PRODUCT_IDS[plan.cycle];
}

// Static fallbacks only, shown before checkout loads a live price (same
// rationale as COOKBOOK_PRICE_FALLBACK) — checkout states the authoritative
// price. Keep these in sync with the RevenueCat product if they ever change.
export const PRO_MONTHLY_PRICE_FALLBACK = "$4.99/mo";
export const PRO_ANNUAL_PRICE_FALLBACK = "$39.99/yr";

// One month that doesn't renew, priced the same as a month of the subscription.
export const PRO_ONE_MONTH_PRICE_FALLBACK = "$4.99";

export const PRO_PRICE_FALLBACKS = {
  monthly: PRO_MONTHLY_PRICE_FALLBACK,
  annual: PRO_ANNUAL_PRICE_FALLBACK,
} as const satisfies Record<ProBillingCycle, string>;

// Raw numbers, kept separate from the display strings above so the annual
// savings figure is computed rather than typed by hand — a copy edit to the
// fallback strings can't silently make the savings claim wrong.
const PRO_MONTHLY_PRICE_USD = 4.99;
const PRO_ANNUAL_PRICE_USD = 39.99;

/** What the annual plan saves versus paying monthly for a year, as a whole
 *  percent, rounded down so the claim is never optimistic. */
export function proAnnualSavingsPercent(): number {
  const yearlyAtMonthlyRate = PRO_MONTHLY_PRICE_USD * 12;
  const savings = 1 - PRO_ANNUAL_PRICE_USD / yearlyAtMonthlyRate;
  return Math.floor(savings * 100);
}
