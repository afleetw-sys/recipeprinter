import type { ProLockReason } from "@/lib/recipePrinterPurchases";
import { IMAGE_IMPORTS_PER_HOUR_PRO } from "@/lib/imageImportQuota";
import {
  FREE_IMPORTS_PER_WINDOW,
  FREE_IMPORT_WINDOW_DAYS,
  formatImportReturnDate,
} from "@/lib/freeImports";

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
// Not "no watermark": the free line is a quiet footer, not a watermark, and
// the wording shouldn't talk the free tier down. See `.recipe-print-page--pro`.
const NO_BRANDING_BENEFIT = "No RecipePrinter branding on your prints";
// Free accounts get a monthly allowance of imports (lib/freeImports.ts, enforced
// by CookPilot's import meter); Pro has none. Photo imports stay paced by the
// hour on every plan, which is why that line is separate.
const UNLIMITED_IMPORTS_BENEFIT = "Unlimited recipe imports";

// What Basic (the free tier) actually includes. Shared by /account and
// /pricing, so the two cannot describe the free plan differently — and it's a lot, which the
// old "Classic & Pantry themes / Full Page printing / one recipe at a time"
// list undersold by leading with a limitation.
// "One recipe at a time" is real (see PrintSetupControls.tsx's "This
// recipe" title) but it's a constraint, not a benefit, so it doesn't belong
// on a list meant to make the case for staying on Basic being a perfectly
// good deal. The first line is the import allowance, whose usage /account
// shows under it. The hourly photo pacing (lib/imageImportQuota.ts) is real on
// every plan but is not listed on either plan: with an allowance of imports it
// isn't something to sell (Amelia, 2026-10-10). /account still shows this
// hour's photo usage, as usage rather than as a benefit.
export const FREE_IMPORTS_BENEFIT = `${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days`;
export const BASIC_BENEFITS = [
  FREE_IMPORTS_BENEFIT,
  "Import from any recipe site, Instagram, TikTok, Pinterest & more",
  "Edit any recipe and add your own photos",
  "Letter-size printing with two free themes",
];

// Exported so `AccountProStatus` can show the same list to a Free account —
// one list, so a change here doesn't quietly leave the two surfaces
// disagreeing about what Pro actually includes. The photo-import allowance is
// enforced by CookPilot per plan (see lib/imageImportQuota.ts), not by a lock
// here, so it has no `ProLockReason`.
export const PRO_BENEFITS = [
  UNLIMITED_IMPORTS_BENEFIT,
  ...Object.values(BENEFIT_BY_REASON),
  NO_BRANDING_BENEFIT,
  COOKBOOK_BENEFIT,
];

/** Opened from a photo import that hit the free hourly limit. */
export const IMAGE_IMPORT_LIMIT_TRIGGER = "image_import_limit";
/** Opened from an import that didn't start because the free allowance is used up. */
export const IMPORT_LIMIT_TRIGGER = "import_limit";
/** Opened by a link or photo import that found more recipes than the free plan adds. */
export const MULTI_RECIPE_FOUND_TRIGGER = "multi_recipe_found";

/** Opened by clicking the "Printed with RecipePrinter" line on a card. */
export const REMOVE_BRANDING_TRIGGER = "remove_branding";

const TITLE_BY_REASON: Record<ProLockReason, string> = {
  multi_recipe: "Print multiple recipes at once",
  card_size: "Print 4×6 recipe cards",
  theme: "Print with this premium theme",
};

export interface ProUpgradeCopy {
  title: string;
  /** A sentence or two under the title, when the title alone would leave a
      question open (what happened, and what the cook still has). */
  body?: string;
  /** Every benefit, with whichever triggered the dialog first. */
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
export function proUpgradeCopy(
  reasons: ProLockReason[],
  trigger: string,
  /** For `IMPORT_LIMIT_TRIGGER`: the allowance and when it resets, and whether
      there are recipes on the page to point to. */
  importUsage?: { limit: number; nextFreeAt: number | null } | null,
  hasRecipes: boolean = false,
  /** For `MULTI_RECIPE_FOUND_TRIGGER`: how many recipes the import found, and in what. */
  found?: { count: number; source: "url" | "image" } | null,
): ProUpgradeCopy {
  if (trigger === MULTI_RECIPE_FOUND_TRIGGER && found && found.count > 1) {
    const others = found.count - 1;
    return {
      title: `We found ${found.count} recipes ${found.source === "image" ? "in that photo" : "on that link"}`,
      // What happened first, so one recipe out of several doesn't read as a
      // failed import, then what Pro does about it. The others are held for
      // this session, so upgrading adds them without importing again.
      body: `The free plan adds one recipe at a time, so we added the first one. Upgrade to Pro and we'll add the other ${others === 1 ? "one" : others}.`,
      benefits: [...PRO_BENEFITS].sort(
        (a, b) => Number(b === BENEFIT_BY_REASON.multi_recipe) - Number(a === BENEFIT_BY_REASON.multi_recipe),
      ),
      ctaLabel: "Unlock Pro and add the rest",
    };
  }
  if (trigger === IMPORT_LIMIT_TRIGGER) {
    const back = importUsage?.nextFreeAt
      ? `Your free imports reset ${formatImportReturnDate(importUsage.nextFreeAt)}. `
      : "";
    return {
      title: `You've used your ${importUsage?.limit ?? FREE_IMPORTS_PER_WINDOW} free imports`,
      // Says what they still have before what they could buy: nothing they
      // made is locked, and waiting is a real option. Only when it's true: an
      // import sent from the homepage arrives on a fresh, empty project.
      body: `${back}${hasRecipes ? "You can still edit and print the recipes you've imported. " : ""}Upgrade to Pro for unlimited recipe imports.`,
      benefits: PRO_BENEFITS,
      ctaLabel: "Unlock Pro",
    };
  }
  if (trigger === IMAGE_IMPORT_LIMIT_TRIGGER) {
    return {
      title: `Import up to ${IMAGE_IMPORTS_PER_HOUR_PRO} images an hour`,
      benefits: PRO_BENEFITS,
      ctaLabel: "Unlock Pro",
    };
  }
  // Before the lock reasons: a locked card size can be selected at the same
  // moment, and it isn't what was clicked.
  if (trigger === REMOVE_BRANDING_TRIGGER) {
    return {
      title: "Print without RecipePrinter branding",
      benefits: [NO_BRANDING_BENEFIT, ...PRO_BENEFITS.filter((b) => b !== NO_BRANDING_BENEFIT)],
      ctaLabel: "Unlock Pro and continue",
    };
  }
  if (trigger === "topbar_button" || reasons.length === 0) return GENERIC_COPY;
  const triggered = new Set(reasons.map((reason) => BENEFIT_BY_REASON[reason]));
  return {
    title: reasons.length === 1 ? TITLE_BY_REASON[reasons[0]] : "Unlock your Pro print setup",
    // Stable sort: triggered benefits first, everything else keeps its place.
    benefits: [...PRO_BENEFITS].sort((a, b) => Number(triggered.has(b)) - Number(triggered.has(a))),
    ctaLabel: trigger === "print_button" ? "Unlock Pro and print" : "Unlock Pro and continue",
  };
}
