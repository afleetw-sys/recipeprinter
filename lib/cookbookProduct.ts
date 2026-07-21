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
export const COOKBOOK_ENABLED = false;

// A single one-time purchase that unlocks the cookbook layout (cover, section
// dividers, etc.) for this browser/account — separate from per-template
// purchases, but resolved through the same RevenueCat project.
export const RECIPEPRINTER_COOKBOOK_OFFERING_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PACKAGE_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PRODUCT_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_ENTITLEMENT_ID = "cookbook";

// Shown until the real RevenueCat price loads (or if it fails to load) so the
// offer dialog never has to hide its price entirely.
export const COOKBOOK_PRICE_FALLBACK = "$19.99";

// What the offer dialog promises. Every line here must name something the
// product actually does — this is the copy on a paid upgrade. "Table of
// contents" was listed until it turned out nothing renders one; it comes back
// the day a TOC page does, and not before.
export const COOKBOOK_BENEFITS = [
  "Personalized cover",
  "Organized sections",
  "Premium layouts throughout",
  "Ready to print or gift",
] as const;
