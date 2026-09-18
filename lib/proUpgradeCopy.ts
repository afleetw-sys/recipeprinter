import type { ProLockReason } from "@/lib/recipePrinterPurchases";

// Every one of these is a real, implemented gate (see computeProLocks in
// lib/recipePrinterPurchases.ts). A "20% off your first cookbook export"
// line used to sit here too, then got pulled because no checkout path
// anywhere actually applied the discount — a Pro subscriber was charged the
// same $19.99 as anyone else. That's fixed now (see
// lib/cookbookProduct.ts's isFirstCookbookDiscountEligible, threaded through
// lib/useCookbookPurchase.ts to lib/recipePrinterPurchases.ts's
// packageForCookbook, which resolves RevenueCat's real `cookbook_pro_first`
// package). Don't add a benefit back here without wiring the real thing
// behind it first.
//
// Key order is the canonical order the list reads in when nothing triggered it.
const BENEFIT_BY_REASON: Record<ProLockReason, string> = {
  multi_recipe: "Print multiple recipes at once",
  card_size: "4×6 recipe cards",
  theme: "All premium themes",
};
const COOKBOOK_BENEFIT = "20% off your first cookbook";

// Exported so `AccountProStatus` can show the same list to a Free account —
// one list, so a change here doesn't quietly leave the two surfaces
// disagreeing about what Pro actually includes.
export const PRO_BENEFITS = [...Object.values(BENEFIT_BY_REASON), COOKBOOK_BENEFIT];

const TITLE_BY_REASON: Record<ProLockReason, string> = {
  multi_recipe: "Print multiple recipes at once",
  card_size: "Print 4×6 recipe cards",
  theme: "Print with this premium theme",
};

export interface ProUpgradeCopy {
  title: string;
  /** All four benefits, with whichever triggered the dialog first. */
  benefits: string[];
  ctaLabel: string;
}

const GENERIC_COPY: ProUpgradeCopy = {
  title: "Upgrade to RecipePrinter Pro",
  benefits: PRO_BENEFITS,
  ctaLabel: "Unlock Pro",
};

/**
 * Everything the upgrade dialog says that depends on what opened it, derived
 * from the same `reasons` (see `activeProLockReasons`) and trigger that already
 * drive analytics, so the copy can't name a different reason than the click.
 *
 * The header's Upgrade button (`topbar_button`) has no blocked action to
 * reference, so it always gets the generic pitch — even if a locked theme or
 * card size happens to be selected at that moment.
 */
export function proUpgradeCopy(reasons: ProLockReason[], trigger: string): ProUpgradeCopy {
  if (trigger === "topbar_button" || reasons.length === 0) return GENERIC_COPY;
  const triggered = new Set(reasons.map((reason) => BENEFIT_BY_REASON[reason]));
  return {
    title: reasons.length === 1 ? TITLE_BY_REASON[reasons[0]] : "Unlock your Pro print setup",
    // Stable sort: triggered benefits first, everything else keeps its place.
    benefits: [...PRO_BENEFITS].sort((a, b) => Number(triggered.has(b)) - Number(triggered.has(a))),
    ctaLabel: trigger === "print_button" ? "Unlock Pro and print" : "Unlock Pro and continue",
  };
}
