// A single one-time purchase that unlocks the cookbook layout (cover, section
// dividers, table of contents, etc.) for this browser/account — separate from
// per-template purchases, but resolved through the same RevenueCat project.
export const RECIPEPRINTER_COOKBOOK_OFFERING_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PACKAGE_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PRODUCT_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_ENTITLEMENT_ID = "cookbook";

// Shown until the real RevenueCat price loads (or if it fails to load) so the
// offer dialog never has to hide its price entirely.
export const COOKBOOK_PRICE_FALLBACK = "$19.99";

export const COOKBOOK_BENEFITS = [
  "Personalized cover",
  "Organized sections",
  "Table of contents",
  "Premium layouts throughout",
  "Ready to print or gift",
] as const;
