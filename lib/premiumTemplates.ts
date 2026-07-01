import type { RecipePrintTemplate } from "@/components/RecipeCardPrint";

export const RECIPEPRINTER_OFFERING_ID = "premium_templates";

export const FREE_TEMPLATE_IDS = ["classic", "pantry"] satisfies RecipePrintTemplate[];

export const PREMIUM_TEMPLATE_ENTITLEMENTS = {
  heirloom: "template_heirloom",
  bistro: "template_bistro",
  counter: "template_counter",
} as const satisfies Partial<Record<RecipePrintTemplate, string>>;

export const PREMIUM_TEMPLATE_PACKAGE_IDS = {
  heirloom: "heirloom",
  bistro: "bistro",
  counter: "counter",
} as const satisfies Partial<Record<RecipePrintTemplate, string>>;

export const PREMIUM_TEMPLATE_PRODUCT_IDS = {
  heirloom: "heirloom",
  bistro: "bistro",
  counter: "counter",
} as const satisfies Partial<Record<RecipePrintTemplate, string>>;

export type PremiumRecipePrintTemplate = keyof typeof PREMIUM_TEMPLATE_ENTITLEMENTS;

export function isPremiumTemplate(
  template: RecipePrintTemplate,
): template is PremiumRecipePrintTemplate {
  return template in PREMIUM_TEMPLATE_ENTITLEMENTS;
}

export function isFreeTemplate(template: RecipePrintTemplate): boolean {
  return (FREE_TEMPLATE_IDS as readonly RecipePrintTemplate[]).includes(template);
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
