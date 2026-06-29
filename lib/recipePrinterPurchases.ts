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
  RECIPEPRINTER_OFFERING_ID,
  type PremiumRecipePrintTemplate,
} from "@/lib/premiumTemplates";

type PurchasesModule = typeof import("@revenuecat/purchases-js");

let purchasesModulePromise: Promise<PurchasesModule> | null = null;
let purchasesInstance: Purchases | null = null;
let configuredUserId: string | null = null;

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

async function getPurchases(userId: string): Promise<Purchases> {
  const { Purchases } = await loadPurchasesModule();
  const apiKey = revenueCatApiKey();

  if (!purchasesInstance) {
    purchasesInstance = Purchases.configure({ apiKey, appUserId: userId });
    configuredUserId = userId;
    return purchasesInstance;
  }

  if (configuredUserId !== userId) {
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

export async function loadRecipePrinterCustomerInfo(
  userId: string,
): Promise<CustomerInfo> {
  return getPurchases(userId).then((purchases) => purchases.getCustomerInfo());
}

async function packageForTemplate(
  purchases: Purchases,
  template: PremiumRecipePrintTemplate,
): Promise<Package> {
  const offerings = await purchases.getOfferings();
  const offering = offerings.all[RECIPEPRINTER_OFFERING_ID] ?? offerings.current;
  const packageId = packageIdForTemplate(template);
  const rcPackage =
    offering?.packagesById[packageId] ??
    offering?.availablePackages.find((candidate) => candidate.identifier === packageId);

  if (!rcPackage) {
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
    Object.entries(PREMIUM_TEMPLATE_PACKAGE_IDS)
      .map(([template, packageId]) => {
        const rcPackage =
          offering.packagesById[packageId] ??
          offering.availablePackages.find((candidate) => candidate.identifier === packageId);
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
