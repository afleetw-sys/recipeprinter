/**
 * Whether the cookbook experience is offered at all.
 *
 * Off until it's ready to launch. Only the two entry points are gated — "Make
 * it a cookbook" in the header and the mobile toolbar — so everything behind
 * them (the sections/cover/divider layer in lib/project.ts, the divider and
 * cover faces, the sheet packing that places them, the purchase flow) stays
 * live, compiled and type-checked. A project already in cookbook mode from
 * before the gate, or restored from a saved project, keeps rendering exactly
 * as it did rather than silently losing its cover and sections.
 *
 * A named constant rather than the `false &&` this replaced: a literal-false
 * branch is invisible to TypeScript, ESLint and grep, so it survives refactors
 * unnoticed and reads like a mistake to anyone who finds it. This is greppable,
 * says why, and makes relaunching a one-line change — same approach as the
 * Fruit Stand template's gate in components/RecipeCardPrint.tsx.
 */
export const COOKBOOK_ENABLED = true;

// One purchase unlocks one stable cookbook project. The RevenueCat web product
// behind this identifier must be configured as a repeat-purchasable consumable;
// the permanent ownership record is our project-scoped unlock, not a global
// cookbook entitlement. `RECIPEPRINTER_COOKBOOK_ENTITLEMENT_ID` remains only
// for grandfathering customers who bought the former account-wide unlock.
export const RECIPEPRINTER_COOKBOOK_OFFERING_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PACKAGE_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PRODUCT_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_ENTITLEMENT_ID = "cookbook";

// Shown until the real RevenueCat price loads (or if it fails to load) so the
// offer dialog never has to hide its price entirely.
export const COOKBOOK_PRICE_FALLBACK = "$19.99";

// What the offer dialog promises. Every line here must name something the
// product actually does — this is the copy on a paid upgrade, and it sells the
// COOKBOOK, not the PDF (the PDF is only the delivery format). "Table of
// contents" was listed until it turned out nothing renders one; it's back now
// that a real TOC page does. Print-ready format presets (Print your cookbook →
// Save as PDF) are why the last two lines can promise print-ready layouts.
export const COOKBOOK_BENEFITS = [
  "A designed cover, chapters & back cover",
  "Automatic table of contents & page numbers",
  "Print-ready formats: US Letter spiral or 8×10 hardcover",
  "Print at home, or order from Lulu, Blurb & Staples",
] as const;
