import type { RecipePrintTemplate } from "@/components/RecipeCardPrint";

export const RECIPEPRINTER_OFFERING_ID = "premium_templates";

export const PREMIUM_TEMPLATE_ENTITLEMENTS = {
  heirloom: "template_heirloom",
  bistro: "template_bistro",
  counter: "template_counter",
  keepsake: "template_keepsake",
} as const satisfies Partial<Record<RecipePrintTemplate, string>>;

export const PREMIUM_TEMPLATE_PACKAGE_IDS = {
  heirloom: "heirloom",
  bistro: "bistro",
  counter: "counter",
  keepsake: "keepsake",
} as const satisfies Partial<Record<RecipePrintTemplate, string>>;

export const PREMIUM_TEMPLATE_PRODUCT_IDS = {
  heirloom: "heirloom",
  bistro: "bistro",
  counter: "counter",
  keepsake: "keepsake",
} as const satisfies Partial<Record<RecipePrintTemplate, string>>;

export type PremiumRecipePrintTemplate = keyof typeof PREMIUM_TEMPLATE_ENTITLEMENTS;

export function isPremiumTemplate(
  template: RecipePrintTemplate,
): template is PremiumRecipePrintTemplate {
  return template in PREMIUM_TEMPLATE_ENTITLEMENTS;
}

export function entitlementForTemplate(template: PremiumRecipePrintTemplate): string {
  return PREMIUM_TEMPLATE_ENTITLEMENTS[template];
}

export function packageIdForTemplate(template: PremiumRecipePrintTemplate): string {
  return PREMIUM_TEMPLATE_PACKAGE_IDS[template];
}

export function productIdForTemplate(template: PremiumRecipePrintTemplate): string {
  return PREMIUM_TEMPLATE_PRODUCT_IDS[template];
}
