import type { RecipePrintTemplate } from "@/types/recipe";

// The four templates RecipePrinter used to sell individually ($1.99 each,
// one-time). New sales of a single template are retired in favor of the
// RecipePrinter Pro subscription (lib/proProduct.ts), which includes every
// theme — but these ids stay exactly as they are so an existing owner's
// entitlement keeps resolving. Only the checkout path for buying one of
// these on its own was removed (see `hasTemplateOrProEntitlement` in
// lib/recipePrinterPurchases.ts, which is now what every theme-lock check
// calls instead of `hasTemplateEntitlement` directly).
export const PREMIUM_TEMPLATE_ENTITLEMENTS = {
  heirloom: "template_heirloom",
  bistro: "template_bistro",
  counter: "template_counter",
  keepsake: "template_keepsake",
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
