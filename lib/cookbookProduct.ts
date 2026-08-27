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
 * ⚠️ BEFORE THIS IS `true` IN PRODUCTION — cookbook unlocks must be made
 * server-authoritative first, or a signed-in user can grant themselves the paid
 * unlock for free. Do the ordered sequence in docs/cookbook-unlock-webhook.md:
 *   1. ship the `cookbook_project_id` attribute (lib/recipePrinterPurchases.ts)
 *   2. deploy the extended RevenueCat webhook (CookPilot functions)
 *   3. verify a real/sandbox purchase writes the unlock doc server-side
 *   4. lock down firestore.rules (cookbookUnlocks → server-write only)
 *   5. remove the now-dead client unlock writes
 * Until all five are done, the unlock is client-writable and refunds never
 * revoke. (Inert while this flag is `false`, since no one can purchase.)
 */
export const COOKBOOK_ENABLED = true;

// One purchase unlocks one stable cookbook project. The RevenueCat web product
// behind this identifier must be configured as a repeat-purchasable consumable;
// the permanent ownership record is our project-scoped unlock, not a global
// cookbook entitlement — there is no account-wide entitlement to read.
export const RECIPEPRINTER_COOKBOOK_OFFERING_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PACKAGE_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PRODUCT_ID = "cookbook";

// The cookbook's price, shown wherever we name it ourselves (e.g. the welcome
// dialog). Checkout states the authoritative price; keep this in sync with the
// RevenueCat product if it ever changes.
export const COOKBOOK_PRICE_FALLBACK = "$19.99";
