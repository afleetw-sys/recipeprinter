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

// Premium themes added after single-theme sales were retired. They were never
// sold on their own, so they have no entitlement of their own: RecipePrinter
// Pro (or a cookbook's own unlock) is the only way in. Kept out of the map
// above on purpose, because every id in it is mirrored from RevenueCat and
// treated as a lifetime grant (lib/proAccessFallback.ts).
const PRO_ONLY_TEMPLATES = ["typewriter"] as const satisfies readonly RecipePrintTemplate[];

export type PremiumRecipePrintTemplate =
  | keyof typeof PREMIUM_TEMPLATE_ENTITLEMENTS
  | (typeof PRO_ONLY_TEMPLATES)[number];

export function isPremiumTemplate(
  template: RecipePrintTemplate,
): template is PremiumRecipePrintTemplate {
  return (
    template in PREMIUM_TEMPLATE_ENTITLEMENTS ||
    (PRO_ONLY_TEMPLATES as readonly RecipePrintTemplate[]).includes(template)
  );
}

// A fresh cookbook opens on a premium theme (unlocked inside the book, so no
// paywall) so the first view looks designed rather than the plain Classic
// default. Always the same one: it used to rotate through the four per device,
// which made a cook's first book depend on what they had made before.
export const DEFAULT_COOKBOOK_TEMPLATE: PremiumRecipePrintTemplate = "bistro";

/** The theme a new cookbook opens on: a premium theme the cook already chose is
    respected, anything else (the Classic default) becomes the default book theme. */
export function cookbookTemplateFor(current: RecipePrintTemplate): PremiumRecipePrintTemplate {
  return isPremiumTemplate(current) ? current : DEFAULT_COOKBOOK_TEMPLATE;
}

/** The legacy single-theme entitlement, or null for a Pro-only theme that never had one. */
export function entitlementForTemplate(template: PremiumRecipePrintTemplate): string | null {
  return template in PREMIUM_TEMPLATE_ENTITLEMENTS
    ? PREMIUM_TEMPLATE_ENTITLEMENTS[template as keyof typeof PREMIUM_TEMPLATE_ENTITLEMENTS]
    : null;
}
