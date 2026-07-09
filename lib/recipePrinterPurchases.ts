import type {
  CustomerInfo,
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

type PurchasesModule = typeof import("@revenuecat/purchases-js");

let purchasesModulePromise: Promise<PurchasesModule> | null = null;
let purchasesInstance: Purchases | null = null;
let configuredUserId: string | null = null;
let configuringPromise: Promise<Purchases> | null = null;

const RECIPEPRINTER_CUSTOMER_STORAGE_KEY = "recipeprinter:revenuecat-user-id:v1";
const RECIPEPRINTER_LINKED_UID_STORAGE_KEY = "recipeprinter:revenuecat-linked-uid:v1";

// A page refresh always looks like "just signed in" to Firebase Auth (the
// session rehydrates from storage a moment after mount), so without this
// the alias call and its toast would fire on every reload for a signed-in
// user instead of once per account per browser.
function hasLinkedRecipePrinterCustomer(uid: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RECIPEPRINTER_LINKED_UID_STORAGE_KEY) === uid;
  } catch {
    return false;
  }
}

function markRecipePrinterCustomerLinked(uid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECIPEPRINTER_LINKED_UID_STORAGE_KEY, uid);
  } catch {
    /* ignore */
  }
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
  if (typeof window === "undefined") {
    return Purchases.generateRevenueCatAnonymousAppUserId();
  }

  try {
    const stored = window.localStorage.getItem(RECIPEPRINTER_CUSTOMER_STORAGE_KEY);
    if (stored) return stored;

    const next = Purchases.generateRevenueCatAnonymousAppUserId();
    window.localStorage.setItem(RECIPEPRINTER_CUSTOMER_STORAGE_KEY, next);
    return next;
  } catch {
    return Purchases.generateRevenueCatAnonymousAppUserId();
  }
}

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
  // the `!purchasesInstance` check above — Purchases.configure() does its
  // own subscriber fetch, so a race here double-logs the customer to
  // RevenueCat.
  if (!configuringPromise) {
    const apiKey = revenueCatApiKey();
    configuringPromise = (async () => {
      try {
        const instance = Purchases.configure({ apiKey, appUserId: userId });
        purchasesInstance = instance;
        configuredUserId = userId;
        return instance;
      } catch (error) {
        configuringPromise = null;
        throw error;
      }
    })();
  }

  return configuringPromise;
}

/**
 * Registers this browser as a RevenueCat customer. Called the moment a user
 * imports a recipe (any path — URL, photo, pasted text, CookPilot), not on
 * every page view: RevenueCat has no concept of "just looking," so eagerly
 * configuring on mount was minting a customer record for every drive-by
 * visit to the print page, including ones with nothing to print.
 */
export async function ensureRecipePrinterCustomer(): Promise<string> {
  const userId = await recipePrinterCustomerId();
  await getPurchases(userId);
  return userId;
}

export function hasTemplateEntitlement(
  customerInfo: CustomerInfo | null,
  template: PremiumRecipePrintTemplate,
): boolean {
  return Boolean(customerInfo?.entitlements.active[entitlementForTemplate(template)]);
}

export async function loadRecipePrinterCustomerInfo(
  userId: string,
): Promise<CustomerInfo> {
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
    ...(email ? { $email: email } : {}),
    ...(displayName ? { $displayName: displayName } : {}),
  });
}

async function packageForTemplate(
  purchases: Purchases,
  template: PremiumRecipePrintTemplate,
): Promise<Package> {
  const offerings = await purchases.getOfferings();
  const offering = offerings.all[RECIPEPRINTER_OFFERING_ID] ?? offerings.current;
  const packageId = packageIdForTemplate(template);
  const productId = productIdForTemplate(template);
  const rcPackage =
    offering?.availablePackages.find(
      (candidate) => candidate.webBillingProduct.identifier === productId,
    ) ??
    offering?.packagesById[packageId] ??
    offering?.availablePackages.find((candidate) => candidate.identifier === packageId);

  if (!rcPackage || rcPackage.webBillingProduct.identifier !== productId) {
    throw new Error("This template isn't ready to buy yet.");
  }

  return rcPackage;
}

export async function loadRecipePrinterTemplatePrices(
  userId: string,
): Promise<Partial<Record<PremiumRecipePrintTemplate, string>>> {
  const purchases = await getPurchases(userId);
  const offerings = await purchases.getOfferings();
  const offering = offerings.all[RECIPEPRINTER_OFFERING_ID] ?? offerings.current;

  if (!offering) return {};

  return Object.fromEntries(
    (Object.entries(PREMIUM_TEMPLATE_PACKAGE_IDS) as Array<[PremiumRecipePrintTemplate, string]>)
      .map(([template, packageId]) => {
        const productId = productIdForTemplate(template);
        const rcPackage =
          offering.availablePackages.find(
            (candidate) => candidate.webBillingProduct.identifier === productId,
          ) ??
          offering.packagesById[packageId] ??
          offering.availablePackages.find((candidate) => candidate.identifier === packageId);
        if (rcPackage?.webBillingProduct.identifier !== productId) {
          return [template, undefined] as const;
        }
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

function isPurchasesError(error: unknown): error is PurchasesError {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorCode" in error &&
    typeof (error as { errorCode?: unknown }).errorCode === "number"
  );
}
