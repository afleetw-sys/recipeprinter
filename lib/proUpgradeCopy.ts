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
const BENEFIT_BY_REASON: Record<ProLockReason, string> = {
  multi_recipe: "Print several recipes at once",
  card_size: "4×6 recipe cards",
  theme: "All premium themes",
  // Text size was this line until 2026-11; it's one of the Customize
  // settings now, and they're all Pro on a card.
  font_size: "Customize any theme",
};
const COOKBOOK_BENEFIT = "20% off your first cookbook";
// Not "no watermark": the free line is a quiet footer, not a watermark, and
// the wording shouldn't talk the free tier down. See `.recipe-print-page--pro`.
const NO_BRANDING_BENEFIT = "No RecipePrinter branding on your prints";
// Free accounts get a monthly allowance of imports (lib/freeImports.ts, enforced
// by CookPilot's import meter); Pro has none for links and text. Photo imports
// stay paced by the hour on every plan. The benefit line is the short
// "Unlimited imports" all the same (Amelia, 2026-11-16).
const UNLIMITED_IMPORTS_BENEFIT = "Unlimited imports";

// What Free (the free tier) actually includes. Shared by /account and
// /pricing, so the two cannot describe the free plan differently — and it's a lot, which the
// old "Classic & Pantry themes / Full Page printing / one recipe at a time"
// list undersold by leading with a limitation.
// "One recipe at a time" is real (see PrintSetupControls.tsx's "This
// recipe" title) but it's a constraint, not a benefit, so it doesn't belong
// on a list meant to make the case for staying on Free being a perfectly
// good deal. The first line is the import allowance, whose usage /account
// shows under it. The hourly photo pacing (lib/imageImportQuota.ts) is named
// only on the Pro line, which would otherwise overclaim. /account still shows
// this hour's photo usage, as usage rather than as a benefit.
export const FREE_IMPORTS_BENEFIT = `${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days`;
export const BASIC_BENEFITS = [
  FREE_IMPORTS_BENEFIT,
  "Import from any recipe site, Instagram, TikTok, Pinterest & more",
  "Edit any recipe and add your own photos",
  "Full-page printing with two free themes",
];

// Exported so `AccountProStatus` can show the same list to a Free account —
// one list, so a change here doesn't quietly leave the two surfaces
// disagreeing about what Pro actually includes. The photo-import allowance is
// enforced by CookPilot per plan (see lib/imageImportQuota.ts), not by a lock
// here, so it has no `ProLockReason`.
//
// Ordered by how many people hit each one at the paywall (PostHog,
// paywall_viewed + pro_feature_encountered, distinct people, 30 days to
// 2026-11-17): several recipes 34, imports 21, 4×6 cards 18, themes 8,
// branding 5, Customize 3. The cookbook discount opens no paywall, so it ends
// the list.
export const PRO_BENEFITS = [
  BENEFIT_BY_REASON.multi_recipe,
  UNLIMITED_IMPORTS_BENEFIT,
  BENEFIT_BY_REASON.card_size,
  BENEFIT_BY_REASON.theme,
  NO_BRANDING_BENEFIT,
  BENEFIT_BY_REASON.font_size,
  COOKBOOK_BENEFIT,
];

/**
 * The dialog's list: what opened it first, then every other benefit in
 * PRO_BENEFITS order. The whole list shows, with no "And more" (Amelia,
 * 2026-11-17). A benefit the title or body already says is left out, rather
 * than said twice.
 */
function splitBenefits(lead: string[], alreadySaid?: string): Pick<ProUpgradeCopy, "highlights"> {
  const highlights = lead.filter((benefit) => benefit !== alreadySaid);
  for (const benefit of PRO_BENEFITS) {
    if (benefit !== alreadySaid && !highlights.includes(benefit)) highlights.push(benefit);
  }
  return { highlights };
}

/** Opened from a photo import that hit the free hourly limit. */
export const IMAGE_IMPORT_LIMIT_TRIGGER = "image_import_limit";
/** Opened from an import that didn't start because the free allowance is used up. */
export const IMPORT_LIMIT_TRIGGER = "import_limit";
/** Opened by a link or photo import that found more recipes than the free plan adds. */
export const MULTI_RECIPE_FOUND_TRIGGER = "multi_recipe_found";

/** Opened by clicking the "Printed with RecipePrinter" line on a card. */
export const REMOVE_BRANDING_TRIGGER = "remove_branding";

// Each an invitation to the thing the cook just tried (Amelia, 2026-11-16).
const TITLE_BY_REASON: Record<ProLockReason, string> = {
  multi_recipe: "Ready to print several recipes at once?",
  card_size: "Ready to print 4×6 recipe cards?",
  theme: "Ready to use every theme?",
  font_size: "Ready to customize your theme?",
};

/** Over the benefit list when the title already names the feature that
    opened the dialog, so the list is the rest of Pro. */
const ALSO_GET = "You'll also get";
/** Over the list when nothing narrower opened the dialog. */
const PRO_INCLUDES = "Pro includes";

/** A product picture beside the dialog's pitch: what the cook gets on paper,
    not a copy of the screen behind the dialog. */
export interface ProDialogImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** A mockup on a flat colour is shown whole on that colour, since cropping
      it to the panel cuts off half of what it shows; a photo fills. */
  backdrop?: string;
}

/** The flat blue behind the product mockups. */
const MOCKUP_BLUE = "#3c71af";

export const PRO_DIALOG_IMAGES = {
  cards: {
    src: "/images/recipe-card-in-box.jpg",
    alt: "A printed basil pesto recipe card standing in a floral recipe tin",
    width: 1448,
    height: 1086,
  },
  themes: {
    src: "/images/multi-themes.png",
    alt: "One recipe printed in several different themes",
    width: 2400,
    height: 1520,
    backdrop: MOCKUP_BLUE,
  },
  several: {
    src: "/images/multi-recipes.png",
    alt: "Several recipes printed together, one to a page",
    width: 2400,
    height: 1641,
    backdrop: MOCKUP_BLUE,
  },
  collection: {
    src: "/images/cards-on-counter.jpeg",
    alt: "Printed recipe cards spread out beside a recipe box",
    width: 1600,
    height: 1200,
  },
  photo: {
    src: "/images/screenshot-to-card.png",
    alt: "A phone screenshot of a recipe turned into a printed recipe card",
    width: 2400,
    height: 1627,
    backdrop: MOCKUP_BLUE,
  },
} satisfies Record<string, ProDialogImage>;

const IMAGE_BY_REASON: Record<ProLockReason, ProDialogImage> = {
  multi_recipe: PRO_DIALOG_IMAGES.several,
  card_size: PRO_DIALOG_IMAGES.cards,
  theme: PRO_DIALOG_IMAGES.themes,
  font_size: PRO_DIALOG_IMAGES.themes,
};

/** Every picture, for an opening with no one feature to show: they take turns. */
const ALL_DIALOG_IMAGES: ProDialogImage[] = [
  PRO_DIALOG_IMAGES.cards,
  PRO_DIALOG_IMAGES.themes,
  PRO_DIALOG_IMAGES.several,
  PRO_DIALOG_IMAGES.collection,
  PRO_DIALOG_IMAGES.photo,
];

export interface ProUpgradeCopy {
  title: string;
  /** A sentence or two under the title, when the title alone would leave a
      question open (what happened, and what the cook still has). */
  body?: string;
  /** Every benefit, with whichever triggered the dialog first. */
  benefits: string[];
  /** What the dialog lists: every benefit the title doesn't already say. */
  highlights: string[];
  ctaLabel: string;
  /** Over the benefit list: "You'll also get" when the title names one feature. */
  listHeading: string;
  /** The picture beside the pitch; with several, the cook steps through them. */
  images: ProDialogImage[];
}

export const GENERIC_COPY: ProUpgradeCopy = {
  title: "Upgrade to RecipePrinter Pro",
  body: "Import, theme and print your whole recipe collection.",
  benefits: PRO_BENEFITS,
  ...splitBenefits([]),
  ctaLabel: "Get Pro",
  listHeading: PRO_INCLUDES,
  images: ALL_DIALOG_IMAGES,
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
  found?: { count: number; source: "url" | "image" | "text" } | null,
): ProUpgradeCopy {
  if (trigger === MULTI_RECIPE_FOUND_TRIGGER && found && found.count > 1) {
    const where = found.source === "image" ? "in that photo" : found.source === "text" ? "in that text" : "on that link";
    return {
      title: `We found ${found.count} recipes ${where}`,
      // Opened from the picker's "Get all with Pro" (components/
      // FoundRecipesDialog). The recipes are held for this session, so
      // upgrading adds them without importing again; closing this goes back
      // to the picker.
      body: `Pro adds as many recipes at once as you like. Upgrade and we'll add all ${found.count}.`,
      benefits: [...PRO_BENEFITS].sort(
        (a, b) => Number(b === BENEFIT_BY_REASON.multi_recipe) - Number(a === BENEFIT_BY_REASON.multi_recipe),
      ),
      ...splitBenefits([], BENEFIT_BY_REASON.multi_recipe),
      ctaLabel: `Get Pro and add all ${found.count}`,
      listHeading: ALSO_GET,
      images: [PRO_DIALOG_IMAGES.several],
    };
  }
  if (trigger === IMPORT_LIMIT_TRIGGER) {
    const back = importUsage?.nextFreeAt
      ? `Your free imports reset ${formatImportReturnDate(importUsage.nextFreeAt)}. `
      : "";
    return {
      // An invitation, not "that's a lot": nobody should feel told off for
      // using the app (Amelia, 2026-11-16).
      title: "Ready for unlimited imports?",
      // Says what they still have before what they could buy: nothing they
      // made is locked, and waiting is a real option. Only when it's true: an
      // import sent from the homepage arrives on a fresh, empty project.
      body: `You've used your ${importUsage?.limit ?? FREE_IMPORTS_PER_WINDOW} free imports. ${back}${hasRecipes ? "You can still edit and print the recipes you've imported. " : ""}Pro lets you keep importing now.`,
      benefits: PRO_BENEFITS,
      ...splitBenefits([], UNLIMITED_IMPORTS_BENEFIT),
      ctaLabel: "Get Pro",
      listHeading: ALSO_GET,
      images: [PRO_DIALOG_IMAGES.collection],
    };
  }
  if (trigger === IMAGE_IMPORT_LIMIT_TRIGGER) {
    return {
      title: "Ready to import more photos?",
      body: `Pro imports up to ${IMAGE_IMPORTS_PER_HOUR_PRO} photos an hour.`,
      benefits: PRO_BENEFITS,
      ...splitBenefits([]),
      ctaLabel: "Get Pro",
      listHeading: ALSO_GET,
      images: [PRO_DIALOG_IMAGES.photo],
    };
  }
  // Before the lock reasons: a locked card size can be selected at the same
  // moment, and it isn't what was clicked.
  if (trigger === REMOVE_BRANDING_TRIGGER) {
    return {
      title: "Ready to print without branding?",
      benefits: [NO_BRANDING_BENEFIT, ...PRO_BENEFITS.filter((b) => b !== NO_BRANDING_BENEFIT)],
      ...splitBenefits([], NO_BRANDING_BENEFIT),
      ctaLabel: "Get Pro and continue",
      listHeading: ALSO_GET,
      // No picture of an unbranded print yet: every picture takes a turn.
      images: ALL_DIALOG_IMAGES,
    };
  }
  if (trigger === "topbar_button" || reasons.length === 0) return GENERIC_COPY;
  const triggered = new Set(reasons.map((reason) => BENEFIT_BY_REASON[reason]));
  // Stable sort: triggered benefits first, everything else keeps its place.
  const benefits = [...PRO_BENEFITS].sort((a, b) => Number(triggered.has(b)) - Number(triggered.has(a)));
  // A single lock's title names its benefit, so the list leaves it out and
  // reads as the rest of Pro.
  const single = reasons.length === 1 ? reasons[0] : null;
  const alreadySaid = single ? BENEFIT_BY_REASON[single] : undefined;
  return {
    title: single ? TITLE_BY_REASON[single] : "Ready to print with Pro?",
    // A body only where it says something the title doesn't (Amelia,
    // 2026-11-17): a single feature's title already names it.
    body: single ? undefined : "This print uses Pro features. Upgrade and it prints just as you set it up.",
    benefits,
    ...splitBenefits(benefits.filter((benefit) => triggered.has(benefit)), alreadySaid),
    ctaLabel: trigger === "print_button" ? "Get Pro and print" : "Get Pro and continue",
    listHeading: single ? ALSO_GET : PRO_INCLUDES,
    images: reasons.map((reason) => IMAGE_BY_REASON[reason]).filter((image, i, all) => all.indexOf(image) === i),
  };
}
