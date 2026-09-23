import type {
  CustomerInfo,
  Offering,
  Package,
  Purchases,
  PurchasesError,
} from "@revenuecat/purchases-js";
import {
  entitlementForTemplate,
  isPremiumTemplate,
  type PremiumRecipePrintTemplate,
} from "@/lib/premiumTemplates";
import { isProductionRuntime } from "@/lib/appEnvironment";
import { localStore } from "@/lib/storage";
import {
  RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID,
  RECIPEPRINTER_COOKBOOK_OFFERING_ID,
  RECIPEPRINTER_COOKBOOK_PRODUCT_ID,
} from "@/lib/cookbookProduct";
import {
  proProductId,
  RECIPEPRINTER_PRO_ENTITLEMENT_ID,
  RECIPEPRINTER_PRO_OFFERING_ID,
  RECIPEPRINTER_PRO_ONE_MONTH_GRANT_PRODUCT_ID,
  RECIPEPRINTER_PRO_PRODUCT_IDS,
  type ProBillingCycle,
  type ProPlan,
} from "@/lib/proProduct";
import { isProOnlyCardSize } from "@/lib/printTemplates";
import type { PrintCardSize, RecipePrintTemplate } from "@/types/recipe";
import { revenueCatIdentityTransition } from "@/lib/purchaseAccess";

type PurchasesModule = typeof import("@revenuecat/purchases-js");

let purchasesModulePromise: Promise<PurchasesModule> | null = null;
let purchasesInstance: Purchases | null = null;
let configuredUserId: string | null = null;

const RECIPEPRINTER_CUSTOMER_STORAGE_KEY = "recipeprinter:revenuecat-user-id:v1";
const RECIPEPRINTER_KNOWN_CUSTOMER_STORAGE_KEY =
  "recipeprinter:revenuecat-known-customer:v1";
const RECIPEPRINTER_LINKED_UID_STORAGE_KEY = "recipeprinter:revenuecat-linked-uid:v1";

// A page refresh always looks like "just signed in" to Firebase Auth (the
// session rehydrates from storage a moment after mount), so without this
// the alias call and its toast would fire on every reload for a signed-in
// user instead of once per account per browser.
function hasLinkedRecipePrinterCustomer(uid: string): boolean {
  return localStore.get(RECIPEPRINTER_LINKED_UID_STORAGE_KEY) === uid;
}

function markRecipePrinterCustomerLinked(uid: string): void {
  localStore.set(RECIPEPRINTER_LINKED_UID_STORAGE_KEY, uid);
}

/**
 * Has this browser ever had a reason to exist in RevenueCat?
 *
 * RevenueCat is a billing ledger: a customer record should mean "someone with
 * a purchase relationship", not "someone who opened the site". Calling
 * `configure()` is what mints that record, so it's deferred until there is
 * actually something to find — a purchase, or a signed-in account that might
 * own one. A first-time anonymous visitor has
 * no entitlements *by definition*, so asking RevenueCat about them is a
 * guaranteed empty answer bought with a permanent row in the customer list.
 */
function isKnownRecipePrinterCustomer(): boolean {
  // Unreadable storage must answer "not known": the whole point is to avoid
  // minting a customer record for someone who has never purchased, and a
  // false positive here would do exactly that.
  return localStore.get(RECIPEPRINTER_KNOWN_CUSTOMER_STORAGE_KEY) === "1";
}

function markRecipePrinterCustomerKnown(): void {
  localStore.set(RECIPEPRINTER_KNOWN_CUSTOMER_STORAGE_KEY, "1");
}

function revenueCatApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY;
  if (!apiKey) {
    throw new Error("Premium templates are temporarily unavailable.");
  }
  return apiKey;
}

async function loadPurchasesModule(): Promise<PurchasesModule> {
  purchasesModulePromise ??= import("@revenuecat/purchases-js");
  return purchasesModulePromise;
}

// RevenueCat's own anonymous-id format: the `$RCAnonymousID:` prefix followed
// by a v4 UUID with the dashes stripped. This is a byte-for-byte replica of
// `Purchases.generateRevenueCatAnonymousAppUserId()` (see purchases-js —
// literally `\`$RCAnonymousID:${uuid().replace(/-/g,"")}\``), reproduced here so
// an id can be minted WITHOUT loading the SDK. RevenueCat decides anonymity by
// a prefix check (`appUserId.startsWith("$RCAnonymousID:")`), so an id made
// here is indistinguishable from one the SDK would make, both to the SDK when
// it later configures with it and to the backend.
const REVENUECAT_ANONYMOUS_PREFIX = "$RCAnonymousID:";

function generateAnonymousAppUserId(): string {
  const hex =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${REVENUECAT_ANONYMOUS_PREFIX}${hex}`;
}

function clearClaimedAnonymousCustomerId(): void {
  localStore.remove(RECIPEPRINTER_CUSTOMER_STORAGE_KEY);
}

/**
 * This browser's RevenueCat app-user id — read from storage, or minted locally.
 *
 * Deliberately does NOT load the purchases SDK. The identity effect on the
 * print page calls this the moment there's something to print, and this used
 * to `await loadPurchasesModule()` purely to call the SDK's id generator —
 * pulling ~700KB of billing code onto every /print visit just to produce a
 * string, which is exactly what the dynamic `import()` everywhere else in this
 * file exists to avoid. The SDK now loads only when `getPurchases()` actually
 * configures it, i.e. on a real purchase, claim, or login.
 *
 * Still async so its call sites don't change; it just no longer awaits anything.
 */
export async function recipePrinterCustomerId(): Promise<string> {
  const stored = localStore.get(RECIPEPRINTER_CUSTOMER_STORAGE_KEY);
  if (stored) return stored;

  // A fresh id either way. When the write fails (or we're on the server) the
  // caller still gets a usable id for this call; it just won't be the same one
  // next time, which is the unavoidable cost of having nowhere to remember it.
  const next = generateAnonymousAppUserId();
  localStore.set(RECIPEPRINTER_CUSTOMER_STORAGE_KEY, next);
  return next;
}

/**
 * Configures the SDK, creating the RevenueCat customer if it doesn't exist.
 *
 * Read that again before adding a caller: reaching this function is what puts
 * a row in the customer list, permanently. It is only legitimate once the user
 * has shown purchase intent, signed in, or already bought something. Loading
 * anything "just to have it ready" on mount — prices, entitlements, offerings
 * — turns every visitor into a customer record. That mistake has been made
 * three separate times in this file's callers; `loadRecipePrinterCustomerInfo`
 * exists precisely so the read-only path can't.
 */
async function getPurchases(userId: string): Promise<Purchases> {
  const { Purchases } = await loadPurchasesModule();

  // `configure` is synchronous, and nothing awaits between this check and the
  // assignment, so concurrent first callers can't both get past it: the first
  // to resume configures, and the rest find the instance.
  if (!purchasesInstance) {
    purchasesInstance = Purchases.configure({ apiKey: revenueCatApiKey(), appUserId: userId });
    configuredUserId = userId;
    // This call is what creates the customer record, so this is the honest
    // moment to record that one now exists. Marking here rather than at each
    // call site means every future path — purchase, login, price lookup —
    // stays covered without having to remember.
    markRecipePrinterCustomerKnown();
  } else if (configuredUserId !== userId) {
    await purchasesInstance.changeUser(userId);
    configuredUserId = userId;
  }
  return purchasesInstance;
}

export function hasTemplateEntitlement(
  customerInfo: CustomerInfo | null,
  template: PremiumRecipePrintTemplate,
): boolean {
  return Boolean(customerInfo?.entitlements.active[entitlementForTemplate(template)]);
}

/**
 * Active RecipePrinter Pro subscriber — every theme, every Pro-only card
 * size, printing multiple recipes at once, advanced layout/customization.
 * The single check every Pro-gated surface should call, so "what counts as
 * Pro" never drifts between call sites.
 *
 * Deliberately the ONLY thing that grants any of those. A legacy $1.99
 * template purchase (`hasTemplateEntitlement`) and a cookbook purchase
 * (a separate, per-project system — see lib/cookbookUnlocks.ts) are each
 * their own narrow entitlement and never imply this one, in either
 * direction: Pro doesn't touch cookbook ownership, and no combination of
 * legacy purchases adds up to Pro. See lib/recipePrinterPurchases.test.ts's
 * "access model" tests for every combination this must hold for.
 */
export function hasProEntitlement(customerInfo: CustomerInfo | null): boolean {
  return Boolean(customerInfo?.entitlements.active[RECIPEPRINTER_PRO_ENTITLEMENT_ID]);
}

/**
 * Can this theme be selected without hitting the Pro paywall: owns it
 * outright (a legacy $1.99 purchase, still honored), or owns Pro (which
 * includes every theme). The one function every theme-lock check should call
 * — "owns this specific theme" and "owns Pro" must never be checked
 * separately, or the two can drift out of sync.
 */
export function hasTemplateOrProEntitlement(
  customerInfo: CustomerInfo | null,
  template: RecipePrintTemplate,
): boolean {
  if (!isPremiumTemplate(template)) return true;
  return hasTemplateEntitlement(customerInfo, template) || hasProEntitlement(customerInfo);
}

/**
 * Can this card size be used right now, without hitting the Pro paywall.
 *
 * Free sizes (just "letter" today) are always allowed. A Pro-only size
 * (currently "card-6x4") needs an active Pro subscription — full stop, no
 * exception for a legacy template purchase. Owning a $1.99 theme grants that
 * theme, for use wherever it's otherwise allowed (a free "letter" page,
 * included); it was never a card-size purchase and does not become one.
 * This used to also check the customer's template entitlements as a
 * grandfather exception — removed, since owning a theme is no longer meant
 * to imply anything about card size at all.
 */
export function canUseCardSize(
  customerInfo: CustomerInfo | null,
  cardSize: PrintCardSize,
): boolean {
  if (!isProOnlyCardSize(cardSize)) return true;
  return hasProEntitlement(customerInfo);
}

/**
 * Can the current print job hold more than one recipe without hitting the
 * Pro paywall. Unlike a theme or a card size, there is nothing to grandfather
 * or preview here: adding a second recipe to one print job IS the premium
 * action, so it is either allowed (Pro) or it doesn't happen (see
 * `openAddRecipeBelow` in app/print/page.tsx, which checks this before ever
 * opening the add-recipe dialog rather than opening it and blocking the
 * result). Cookbook mode is a separate system with its own purchase model
 * and was always meant to hold many recipes — callers must check
 * `cookbookMode` themselves before applying this; it is not baked in here so
 * this function can be tested independently of that context.
 */
export function hasMultiRecipeEntitlement(customerInfo: CustomerInfo | null): boolean {
  return hasProEntitlement(customerInfo);
}

export interface ProLocks {
  themeLocked: boolean;
  cardSizeLocked: boolean;
  multiRecipeLocked: boolean;
  multiRecipeAddLocked: boolean;
  proLocked: boolean;
}

/**
 * Every Pro-gate boolean the print page needs, computed in one pure,
 * independently-testable place — extracted out of app/print/page.tsx so this
 * logic (and every combination of entitlement/cookbook-mode/theme/card-size
 * it has to get right) can be pinned down by a test without rendering the
 * whole page. Pure extraction, no behavior change: matches exactly what
 * page.tsx computed inline before.
 */
export function computeProLocks({
  customerInfo,
  cookbookMode,
  template,
  cardSize,
  recipeCount,
}: {
  customerInfo: CustomerInfo | null;
  cookbookMode: boolean;
  template: RecipePrintTemplate;
  cardSize: PrintCardSize;
  recipeCount: number;
}): ProLocks {
  // Every theme (and every Pro-only card size) is included with the cookbook
  // purchase, so neither paywall applies while in cookbook mode — the
  // cookbook unlock is the only gate there. Switching back to recipe cards
  // restores normal gating.
  // A free theme is never locked: `hasTemplateOrProEntitlement` answers true for it.
  const themeLocked = !cookbookMode && !hasTemplateOrProEntitlement(customerInfo, template);
  const cardSizeLocked = !cookbookMode && !canUseCardSize(customerInfo, cardSize);
  // Printing more than one recipe in one job (outside a cookbook, which has
  // its own separate purchase model) is its own Pro-gated capability — see
  // `hasMultiRecipeEntitlement`. There's nothing to preview here the way a
  // locked theme or card size can be: `openAddRecipeBelow` refuses to add a
  // second recipe at all rather than adding it and only blocking Print.
  const multiRecipeLocked =
    !cookbookMode && !hasMultiRecipeEntitlement(customerInfo) && recipeCount > 1;
  // Whether the NEXT add would be the locked one — reused by `openAddRecipeBelow`
  // (the actual gate) and by the rail's badge (just the visual mark), so the
  // two can never disagree about when Add more recipes is restricted.
  const multiRecipeAddLocked =
    !cookbookMode && recipeCount >= 1 && !hasMultiRecipeEntitlement(customerInfo);
  // All three resolve to the same purchase now (RecipePrinter Pro) — see
  // lib/purchaseAccess.ts's purchaseGate.
  const proLocked = themeLocked || cardSizeLocked || multiRecipeLocked;
  return { themeLocked, cardSizeLocked, multiRecipeLocked, multiRecipeAddLocked, proLocked };
}

export type ProLockReason = "theme" | "card_size" | "multi_recipe";

/**
 * One place to name which lock(s) are actually in effect — reused by
 * analytics (`pro_feature_encountered`/`pro_feature_used`) and by the
 * upgrade dialog's own title/description, so none of them can report or
 * describe a different reason for the same click.
 *
 * Clicking "Add more recipes" always names multi-recipe printing alone, even
 * if a locked theme or card size also happens to be true at that moment —
 * the cook pressed a specific control asking specifically about adding a
 * recipe, so that's the one reason worth naming, not a "few things" message
 * that buries what they actually clicked. Only the print button (or any
 * other non-"add_more_recipes" trigger) reports every lock currently in
 * effect, since pressing Print really is asking "can this whole job go
 * through," and every restriction on it is relevant there. At that moment
 * the job still only holds one recipe (the second hasn't been added yet),
 * so `multiRecipeLocked` alone wouldn't see the "add_more_recipes" case —
 * the trigger name stands in for it (see `openAddRecipeBelow` in
 * app/print/page.tsx).
 */
export function activeProLockReasons(
  locks: Pick<ProLocks, "themeLocked" | "cardSizeLocked" | "multiRecipeLocked">,
  trigger: string,
): ProLockReason[] {
  if (trigger === "add_more_recipes") return ["multi_recipe"];
  const reasons: ProLockReason[] = [];
  if (locks.themeLocked) reasons.push("theme");
  if (locks.cardSizeLocked) reasons.push("card_size");
  if (locks.multiRecipeLocked) reasons.push("multi_recipe");
  return reasons;
}

/**
 * Entitlements for a customer we already know exists.
 *
 * Returns null — without configuring, and so without creating anything — when
 * this browser has never purchased, claimed, or signed in. Callers treat null
 * exactly as "owns nothing", which is what it means.
 */
export async function loadRecipePrinterCustomerInfo(
  userId: string,
): Promise<CustomerInfo | null> {
  if (!isKnownRecipePrinterCustomer()) return null;
  return getPurchases(userId).then((purchases) => purchases.getCustomerInfo());
}

/**
 * Links the current RevenueCat customer to a CookPilot account after login.
 *
 * Unlike `changeUser` (a plain identity switch), `identifyUser` aliases the
 * current anonymous customer's purchase history into `uid` when the current
 * identity is anonymous — this is what recovers a template bought before the
 * user ever logged in. `alreadyLinked` says whether this browser had already
 * linked `uid` on an earlier visit, so the caller can stay quiet on a reload.
 */
export async function identifyRecipePrinterCustomer(
  uid: string,
): Promise<{ customerInfo: CustomerInfo; alreadyLinked: boolean }> {
  const alreadyLinked = hasLinkedRecipePrinterCustomer(uid);

  // A reload clears the in-memory SDK instance but not the anonymous buyer ID.
  // Configure that stored buyer first so signing in can still claim a purchase
  // made before the reload instead of jumping straight to an empty account.
  if (!purchasesInstance) {
    const browserCustomerId = localStore.get(RECIPEPRINTER_CUSTOMER_STORAGE_KEY);
    if (browserCustomerId?.startsWith(REVENUECAT_ANONYMOUS_PREFIX)) {
      await getPurchases(browserCustomerId);
    }
  }

  const transition = revenueCatIdentityTransition(configuredUserId, uid);
  if (!purchasesInstance || transition !== "identify") {
    const purchases = await getPurchases(uid);
    markRecipePrinterCustomerLinked(uid);
    return { customerInfo: await purchases.getCustomerInfo(), alreadyLinked };
  }

  const { customerInfo } = await purchasesInstance.identifyUser(uid);
  configuredUserId = uid;
  markRecipePrinterCustomerLinked(uid);
  // The just-claimed anonymous ID now belongs to this account. Prepare a new
  // guest identity for any future signed-out purchase in this browser.
  clearClaimedAnonymousCustomerId();
  return { customerInfo, alreadyLinked };
}

export async function syncRecipePrinterCustomerAttributes(userId: string): Promise<void> {
  const purchases = await getPurchases(userId);
  await purchases.setAttributes({
    recipeprinter_customer_id: userId,
    // Lets a Customer List filter on environment in the dashboard, so any
    // test record that slips through is findable without matching id strings.
    environment: isProductionRuntime() ? "production" : "development",
  });
}

/** The named offering, falling back to whatever RevenueCat marks current. */
async function offeringFor(purchases: Purchases, offeringId: string): Promise<Offering | null> {
  const offerings = await purchases.getOfferings();
  return offerings.all[offeringId] ?? offerings.current ?? null;
}

/**
 * The package in an offering that sells exactly `productId`, or null.
 *
 * Matched by product, never by package id: a package id is a dashboard-side
 * label, and if it were ever pointed at a different product a lookup by it
 * would happily charge for something else. (This used to also try the package
 * id, twice, then re-check the product; the SDK builds `packagesById` from the
 * same list as `availablePackages`, so those lookups could only ever return
 * what this one already finds.)
 */
function findPackage(offering: Offering | null, productId: string): Package | null {
  return (
    offering?.availablePackages.find((option) => option.webBillingProduct.identifier === productId) ?? null
  );
}

/**
 * Stripe's floating "Developer Tools" launcher, which Stripe.js appends to the
 * page of its own accord once RevenueCat's checkout loads it.
 *
 * Every class on it is build-hashed (`z7mZYGiW__FloatingActionButton`), so the
 * label is the only part of it that will still match after Stripe's next
 * deploy. It is a button, and the whole pill — logo, caret, the panel it opens
 * — lives inside it, so removing this one node takes the widget with it.
 */
const STRIPE_DEV_TOOLS_LAUNCHER = '[aria-label="Open Stripe Developer Tools"]';

/** Does React manage this node? Its fibers hang off the element as own keys. */
function isReactOwned(node: Element): boolean {
  return Object.keys(node).some((key) => key.startsWith("__react"));
}

/**
 * The top of the subtree a vendor built, starting from a node inside it.
 *
 * Walks up while the parent still belongs to the vendor — stopping at `<body>`
 * or at the first node React manages — so the positioning wrapper a widget
 * sits in goes with it, and nothing inside our own tree is ever unmounted from
 * under React.
 */
function vendorSubtreeRoot(node: Element): Element {
  let top = node;
  while (
    top.parentElement &&
    top.parentElement !== document.body &&
    !isReactOwned(top.parentElement)
  ) {
    top = top.parentElement;
  }
  return top;
}

/**
 * Take the checkout's leftovers back out of the document once the sheet is
 * done with them.
 *
 * Two vendors leave two different things behind, and both of them floated over
 * the print preview and then printed with the recipe. It makes no difference
 * whether the cook paid or dismissed the sheet: they arrive with the checkout,
 * and only a reload cleared them.
 *
 * RevenueCat: `purchase()` mounts the checkout into a div it appends to
 * `<body>` and never takes away — and it creates that div with a CLASS of
 * `rcb-ui-root` while looking an existing one up by ID, so the lookup never
 * matches and every trip through checkout leaves another one behind.
 *
 * Stripe: `Stripe.js` adds its own Developer Tools launcher, outside anything
 * RevenueCat owns, so clearing RevenueCat's mount never touched it.
 *
 * Nothing reads any of these nodes afterwards: both SDKs build fresh UI for the
 * next purchase whether or not they find the old, so removing them is safe and
 * self-healing. Called when the flow settles, never while it is open.
 */
function releaseCheckoutMount() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".rcb-ui-root, #rcb-ui-root").forEach((node) => node.remove());
  document
    .querySelectorAll(STRIPE_DEV_TOOLS_LAUNCHER)
    .forEach((node) => vendorSubtreeRoot(node).remove());
}

/**
 * Take one package to checkout.
 *
 * The two exported purchases below differ only in which package they resolve
 * and what they tag the sale with. Everything after that is identical and is
 * identical for a reason: a cancel has to come back as `cancelled` rather than
 * throwing (the caller shows a different message), and `releaseCheckoutMount`
 * has to run down EVERY path including the throw, because RevenueCat and
 * Stripe each leave a node behind that otherwise floats over the print preview
 * and prints with the recipe.
 *
 * That made it two copies of one delicate `try/catch/finally`, which is how a
 * fix lands in one of them. Same argument as `findPackage` above: the part
 * that must not be forgotten belongs in one place.
 */
async function checkout(
  purchases: Purchases,
  rcPackage: Package,
  email: string | null | undefined,
  metadata: Record<string, string>,
): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
  try {
    const result = await purchases.purchase({
      rcPackage,
      customerEmail: email ?? undefined,
      metadata,
      skipSuccessPage: true,
    });
    return { customerInfo: result.customerInfo, cancelled: false };
  } catch (error) {
    const { ErrorCode } = await loadPurchasesModule();
    if (isPurchasesError(error) && error.errorCode === ErrorCode.UserCancelledError) {
      return { customerInfo: await purchases.getCustomerInfo(), cancelled: true };
    }
    throw error;
  } finally {
    releaseCheckoutMount();
  }
}

/**
 * Resolves the regular cookbook package, or — when `discountEligible` — the
 * discounted one instead. Same entitlement either way (see
 * lib/cookbookProduct.ts); only the price and product id differ, exactly
 * how `packageForPro` already picks between two priced variants of `pro`.
 */
async function packageForCookbook(
  purchases: Purchases,
  discountEligible: boolean,
): Promise<Package> {
  const offering = await offeringFor(purchases, RECIPEPRINTER_COOKBOOK_OFFERING_ID);
  const rcPackage = findPackage(
    offering,
    discountEligible ? RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID : RECIPEPRINTER_COOKBOOK_PRODUCT_ID,
  );
  if (!rcPackage) throw new Error("The cookbook upgrade isn't ready to buy yet.");
  return rcPackage;
}

export async function purchaseRecipePrinterCookbook({
  userId,
  email,
  projectId,
  discountEligible,
}: {
  userId: string;
  email?: string | null;
  projectId: string;
  discountEligible: boolean;
}): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
  const purchases = await getPurchases(userId);
  const rcPackage = await packageForCookbook(purchases, discountEligible);
  // Give the cookbook-unlock webhook a reliable purchase→project map. Webhook
  // payloads carry subscriber attributes, but not the purchase-time `metadata`
  // below — so set both (attribute for the server, metadata kept for parity).
  // See docs/cookbook-unlock-webhook.md.
  await purchases.setAttributes({ cookbook_project_id: projectId }).catch(() => undefined);

  return checkout(purchases, rcPackage, email, {
    product: "recipeprinter",
    offer: "cookbook",
    cookbook_project_id: projectId,
    ...(discountEligible ? { discount: "pro_first" } : {}),
  });
}

async function packageForPro(purchases: Purchases, plan: ProPlan): Promise<Package> {
  const rcPackage = findPackage(await offeringFor(purchases, RECIPEPRINTER_PRO_OFFERING_ID), proProductId(plan));
  if (!rcPackage) throw new Error("RecipePrinter Pro isn't ready to buy yet.");
  return rcPackage;
}

export async function purchaseRecipePrinterPro({
  userId,
  email,
  plan,
}: {
  userId: string;
  email?: string | null;
  plan: ProPlan;
}): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
  const purchases = await getPurchases(userId);
  const rcPackage = await packageForPro(purchases, plan);
  return checkout(purchases, rcPackage, email, {
    product: "recipeprinter",
    offer: "pro",
    cycle: plan.cycle,
    auto_renew: String(plan.autoRenew),
  });
}

/**
 * Reads the customer back until Pro shows, after a one-month checkout. That
 * purchase grants nothing itself: CookPilot's webhook turns it into a
 * one-month promotional "pro" a few seconds later (see
 * RECIPEPRINTER_PRO_ONE_MONTH_PRODUCT_ID). Returns the last read either way.
 */
export async function waitForProEntitlement(userId: string): Promise<CustomerInfo> {
  const purchases = await getPurchases(userId);
  let customerInfo = await purchases.getCustomerInfo();
  for (let attempt = 0; attempt < 6 && !hasProEntitlement(customerInfo); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    customerInfo = await purchases.getCustomerInfo();
  }
  return customerInfo;
}

export interface ProSubscriptionDetails {
  cycle: ProBillingCycle | null;
  /** True even while canceled (`willRenew: false`) — access lasts through
   *  `expiresAtMs`, it isn't revoked the moment someone cancels. */
  active: boolean;
  willRenew: boolean;
  expiresAtMs: number | null;
}

/** Everything the account menu's Pro section needs to render, derived from
 *  RevenueCat's own `EntitlementInfo` rather than scattered field reads at
 *  each render site. Returns nulls/false across the board when there is no
 *  Pro entitlement at all (never subscribed). */
export function proSubscriptionDetails(customerInfo: CustomerInfo | null): ProSubscriptionDetails {
  const entitlement = customerInfo?.entitlements.all[RECIPEPRINTER_PRO_ENTITLEMENT_ID];
  if (!entitlement) {
    return { cycle: null, active: false, willRenew: false, expiresAtMs: null };
  }
  const product = entitlement.productIdentifier;
  const cycle: ProBillingCycle | null =
    product === RECIPEPRINTER_PRO_PRODUCT_IDS.annual
      ? "annual"
      : product === RECIPEPRINTER_PRO_PRODUCT_IDS.monthly || product === RECIPEPRINTER_PRO_ONE_MONTH_GRANT_PRODUCT_ID
        ? "monthly"
        : null;
  return {
    cycle,
    active: entitlement.isActive,
    // A month bought on its own arrives as a promotional grant, which ends on
    // its own date. It reads exactly like a monthly subscription that was
    // canceled, on purpose.
    willRenew: entitlement.willRenew && entitlement.store !== "promotional",
    expiresAtMs: entitlement.expirationDate ? entitlement.expirationDate.getTime() : null,
  };
}

function isPurchasesError(error: unknown): error is PurchasesError {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorCode" in error &&
    typeof (error as { errorCode?: unknown }).errorCode === "number"
  );
}
