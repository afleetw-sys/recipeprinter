import type {
  CustomerInfo,
  Offering,
  Package,
  Purchases,
  PurchasesError,
} from "@revenuecat/purchases-js";
import {
  entitlementForTemplate,
  packageIdForTemplate,
  PREMIUM_TEMPLATE_PACKAGE_IDS,
  productIdForTemplate,
  RECIPEPRINTER_OFFERING_ID,
  type PremiumRecipePrintTemplate,
} from "@/lib/premiumTemplates";
import { isProductionRuntime } from "@/lib/appEnvironment";
import { localStore } from "@/lib/storage";
import {
  RECIPEPRINTER_COOKBOOK_ENTITLEMENT_ID,
  RECIPEPRINTER_COOKBOOK_OFFERING_ID,
  RECIPEPRINTER_COOKBOOK_PACKAGE_ID,
  RECIPEPRINTER_COOKBOOK_PRODUCT_ID,
} from "@/lib/cookbookProduct";

type PurchasesModule = typeof import("@revenuecat/purchases-js");

let purchasesModulePromise: Promise<PurchasesModule> | null = null;
let purchasesInstance: Purchases | null = null;
let configuredUserId: string | null = null;
let configuringPromise: Promise<Purchases> | null = null;

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
 * actually something to find — a purchase, a claimed free template, or a
 * signed-in account that might own either. A first-time anonymous visitor has
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

export async function recipePrinterCustomerId(): Promise<string> {
  const { Purchases } = await loadPurchasesModule();

  const stored = localStore.get(RECIPEPRINTER_CUSTOMER_STORAGE_KEY);
  if (stored) return stored;

  // A fresh id either way. When the write fails (or we're on the server) the
  // caller still gets a usable id for this call; it just won't be the same one
  // next time, which is the unavoidable cost of having nowhere to remember it.
  const next = Purchases.generateRevenueCatAnonymousAppUserId();
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

  if (purchasesInstance) {
    if (configuredUserId !== userId) {
      await purchasesInstance.changeUser(userId);
      configuredUserId = userId;
    }
    return purchasesInstance;
  }

  // Concurrent first-time callers (e.g. two effects both requesting the SDK
  // on mount) must await the same configure() rather than each racing past
  // the `!purchasesInstance` check above. If the in-flight configure was for
  // a different identity, switch before returning so entitlement reads don't
  // accidentally use a stale anonymous customer while Firebase is logging in.
  if (configuringPromise) {
    const instance = await configuringPromise;
    if (configuredUserId !== userId) {
      await instance.changeUser(userId);
      configuredUserId = userId;
    }
    return instance;
  }

  if (!configuringPromise) {
    const apiKey = revenueCatApiKey();
    configuringPromise = (async () => {
      try {
        const instance = Purchases.configure({ apiKey, appUserId: userId });
        purchasesInstance = instance;
        configuredUserId = userId;
        // This call is what creates the customer record, so this is the
        // honest moment to record that one now exists. Marking here rather
        // than at each call site means every future path — purchase, login,
        // price lookup — stays covered without having to remember.
        markRecipePrinterCustomerKnown();
        return instance;
      } catch (error) {
        configuringPromise = null;
        throw error;
      }
    })();
  }

  return configuringPromise;
}

export function hasTemplateEntitlement(
  customerInfo: CustomerInfo | null,
  template: PremiumRecipePrintTemplate,
): boolean {
  return Boolean(customerInfo?.entitlements.active[entitlementForTemplate(template)]);
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
 * user ever logged in. `wasCreated` tells the caller whether `uid` already
 * had a RevenueCat customer record (i.e. purchases made under this account
 * elsewhere) versus being brand new.
 */
export async function identifyRecipePrinterCustomer(
  uid: string,
): Promise<{ customerInfo: CustomerInfo; wasCreated: boolean; alreadyLinked: boolean }> {
  const alreadyLinked = hasLinkedRecipePrinterCustomer(uid);

  if (alreadyLinked || !purchasesInstance) {
    const purchases = await getPurchases(uid);
    markRecipePrinterCustomerLinked(uid);
    return { customerInfo: await purchases.getCustomerInfo(), wasCreated: false, alreadyLinked };
  }

  const result = await purchasesInstance.identifyUser(uid);
  configuredUserId = uid;
  markRecipePrinterCustomerLinked(uid);
  return { ...result, alreadyLinked };
}

export async function syncRecipePrinterCustomerAttributes({
  userId,
  email,
  displayName,
}: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<void> {
  const purchases = await getPurchases(userId);
  await purchases.setAttributes({
    recipeprinter_customer_id: userId,
    // Lets a Customer List filter on environment in the dashboard, so any
    // test record that slips through is findable without matching id strings.
    environment: isProductionRuntime() ? "production" : "development",
    ...(email ? { $email: email } : {}),
    ...(displayName ? { $displayName: displayName } : {}),
  });
}

/** The named offering, falling back to whatever RevenueCat marks current. */
async function offeringFor(purchases: Purchases, offeringId: string): Promise<Offering | null> {
  const offerings = await purchases.getOfferings();
  return offerings.all[offeringId] ?? offerings.current ?? null;
}

/**
 * Resolves one purchasable package within an offering.
 *
 * Three lookups because RevenueCat dashboard configuration drifts: the product
 * identifier is the reliable key, but packages have historically been reachable
 * only by package id, so both are tried.
 *
 * The closing identity check is the part that matters, and the reason this is
 * one function instead of four copies. The two fallbacks match by *package* id,
 * which is a dashboard-side label — if it were ever pointed at a different
 * product, they would happily return a package that charges for something else.
 * Returning null unless the resolved package's product identifier is exactly
 * the one asked for makes selling the wrong item structurally impossible, and
 * having it in one place means it can't be forgotten at a fifth call site.
 */
function findPackage(
  offering: Offering | null,
  packageId: string,
  productId: string,
): Package | null {
  const candidate =
    offering?.availablePackages.find(
      (option) => option.webBillingProduct.identifier === productId,
    ) ??
    offering?.packagesById[packageId] ??
    offering?.availablePackages.find((option) => option.identifier === packageId);

  return candidate?.webBillingProduct.identifier === productId ? candidate : null;
}

async function packageForTemplate(
  purchases: Purchases,
  template: PremiumRecipePrintTemplate,
): Promise<Package> {
  const rcPackage = findPackage(
    await offeringFor(purchases, RECIPEPRINTER_OFFERING_ID),
    packageIdForTemplate(template),
    productIdForTemplate(template),
  );
  if (!rcPackage) throw new Error("This template isn't ready to buy yet.");
  return rcPackage;
}

export async function loadRecipePrinterTemplatePrices(
  userId: string,
): Promise<Partial<Record<PremiumRecipePrintTemplate, string>>> {
  const purchases = await getPurchases(userId);
  const offering = await offeringFor(purchases, RECIPEPRINTER_OFFERING_ID);
  if (!offering) return {};

  return Object.fromEntries(
    (Object.entries(PREMIUM_TEMPLATE_PACKAGE_IDS) as Array<[PremiumRecipePrintTemplate, string]>)
      .map(([template, packageId]) => {
        const rcPackage = findPackage(offering, packageId, productIdForTemplate(template));
        return [template, rcPackage?.webBillingProduct.price.formattedPrice] as const;
      })
      .filter((entry): entry is [PremiumRecipePrintTemplate, string] => Boolean(entry[1])),
  );
}

export async function purchaseRecipePrinterTemplate({
  userId,
  email,
  template,
}: {
  userId: string;
  email?: string | null;
  template: PremiumRecipePrintTemplate;
}): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
  const purchases = await getPurchases(userId);
  const rcPackage = await packageForTemplate(purchases, template);

  try {
    const result = await purchases.purchase({
      rcPackage,
      customerEmail: email ?? undefined,
      metadata: {
        product: "recipeprinter",
        template,
      },
      skipSuccessPage: true,
    });
    return { customerInfo: result.customerInfo, cancelled: false };
  } catch (error) {
    const { ErrorCode } = await loadPurchasesModule();
    if (isPurchasesError(error) && error.errorCode === ErrorCode.UserCancelledError) {
      return { customerInfo: await purchases.getCustomerInfo(), cancelled: true };
    }
    throw error;
  }
}

async function packageForCookbook(purchases: Purchases): Promise<Package> {
  const rcPackage = findPackage(
    await offeringFor(purchases, RECIPEPRINTER_COOKBOOK_OFFERING_ID),
    RECIPEPRINTER_COOKBOOK_PACKAGE_ID,
    RECIPEPRINTER_COOKBOOK_PRODUCT_ID,
  );
  if (!rcPackage) throw new Error("The cookbook upgrade isn't ready to buy yet.");
  return rcPackage;
}

export function hasCookbookEntitlement(customerInfo: CustomerInfo | null): boolean {
  return Boolean(customerInfo?.entitlements.active[RECIPEPRINTER_COOKBOOK_ENTITLEMENT_ID]);
}

export async function loadRecipePrinterCookbookPrice(userId: string): Promise<string | undefined> {
  const purchases = await getPurchases(userId);
  const rcPackage = findPackage(
    await offeringFor(purchases, RECIPEPRINTER_COOKBOOK_OFFERING_ID),
    RECIPEPRINTER_COOKBOOK_PACKAGE_ID,
    RECIPEPRINTER_COOKBOOK_PRODUCT_ID,
  );
  return rcPackage?.webBillingProduct.price.formattedPrice;
}

export async function purchaseRecipePrinterCookbook({
  userId,
  email,
}: {
  userId: string;
  email?: string | null;
}): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
  const purchases = await getPurchases(userId);
  const rcPackage = await packageForCookbook(purchases);

  try {
    const result = await purchases.purchase({
      rcPackage,
      customerEmail: email ?? undefined,
      metadata: {
        product: "recipeprinter",
        offer: "cookbook",
      },
      skipSuccessPage: true,
    });
    return { customerInfo: result.customerInfo, cancelled: false };
  } catch (error) {
    const { ErrorCode } = await loadPurchasesModule();
    if (isPurchasesError(error) && error.errorCode === ErrorCode.UserCancelledError) {
      return { customerInfo: await purchases.getCustomerInfo(), cancelled: true };
    }
    throw error;
  }
}

function isPurchasesError(error: unknown): error is PurchasesError {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorCode" in error &&
    typeof (error as { errorCode?: unknown }).errorCode === "number"
  );
}
