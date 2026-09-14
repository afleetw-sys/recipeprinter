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
 *
 * Server-authoritative since 2026-09-13 (see docs/cookbook-unlock-webhook.md):
 * the `cookbook_project_id` attribute ships, the RevenueCat webhook is
 * deployed and confirmed configured in RevenueCat's dashboard, a sandbox
 * purchase has been traced through the flow by code review, and
 * `firestore.rules` denies client writes on `cookbookUnlocks`. Without all
 * of that a signed-in user could grant themselves the paid unlock for free
 * and refunds would never revoke — that was true for a period after this
 * flag first went `true`, which is why the docs file above is worth reading
 * before assuming this kind of gate is safe just because the flag is on.
 */
export const COOKBOOK_ENABLED = true;

// One purchase unlocks one stable cookbook project. The RevenueCat web product
// behind this identifier must be configured as a repeat-purchasable consumable;
// the permanent ownership record is our project-scoped unlock, not a global
// cookbook entitlement — there is no account-wide entitlement to read.
export const RECIPEPRINTER_COOKBOOK_OFFERING_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PACKAGE_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PRODUCT_ID = "cookbook";

// A second, discounted product/package — 20% off, for a Pro subscriber's
// first-ever cookbook — attached to the SAME "cookbook" entitlement as the
// regular product above, the same way pro_monthly/pro_annual are two priced
// variants of one "pro" entitlement. Must match
// RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID in CookPilot's
// functions/src/recipePrinterRevenueCat.ts (separate repo, kept in sync by
// hand). CookPilot's `recordFirstCookbookGrant` is what decides eligibility
// server-side (see lib/recipePrinterFreeTemplateClaim.ts's
// `firstCookbookGrantedAt` for how the client reads that signal back).
export const RECIPEPRINTER_COOKBOOK_DISCOUNT_PACKAGE_ID = "cookbook_pro_first";
export const RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID = "cookbook_pro_first";

// The cookbook's price, shown wherever we name it ourselves (e.g. the welcome
// dialog). Checkout states the authoritative price; keep this in sync with the
// RevenueCat product if it ever changes.
export const COOKBOOK_PRICE_FALLBACK = "$19.99";
export const COOKBOOK_DISCOUNT_PRICE_FALLBACK = "$15.99";

/**
 * Is this signed-in Pro subscriber eligible for 20% off their first
 * cookbook — active Pro right now, and this account has never had a
 * cookbook grant land before. `hasPro` must already be resolved through
 * `lib/proAccessFallback.ts`'s live-or-bounded-fallback value (never the raw
 * SDK `customerInfo` directly) — a discount is money, so a momentary
 * RevenueCat outage must not wrongly charge a real Pro subscriber full
 * price the same way it must not wrongly lock them out of a feature.
 * `firstCookbookGrantedAt` is the server-written signal from
 * `lib/recipePrinterFreeTemplateClaim.ts`'s profile read (CookPilot's
 * `recordFirstCookbookGrant`, write-once) — `null` means this account has
 * never received a cookbook.
 */
export function isFirstCookbookDiscountEligible({
  hasPro,
  firstCookbookGrantedAt,
}: {
  hasPro: boolean;
  firstCookbookGrantedAt: number | null;
}): boolean {
  return hasPro && firstCookbookGrantedAt === null;
}
