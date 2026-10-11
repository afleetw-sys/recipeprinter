// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The currency a page quotes is the currency checkout charges.
 *
 * RevenueCat holds a price per currency and, left alone, picks one by
 * geolocating the customer. The page picks one from the country cookie. These
 * pin the two together: checkout always names the page's currency, a customer
 * RevenueCat knows is quoted RevenueCat's own numbers, and a visitor it does
 * not know never causes the SDK to be configured at all.
 */

// A stand-in for the RevenueCat backend: every product priced per currency,
// answering in dollars for a currency it has no price for, as the real one does.
const BACKEND: Record<string, Record<string, number>> = {
  USD: { pro_monthly: 4.99, pro_annual: 39.99, cookbook: 19.99, cookbook_pro_first: 15.99 },
  CAD: { pro_monthly: 7.49, pro_annual: 59.99, cookbook: 29.99, cookbook_pro_first: 23.99 },
  JPY: { pro_monthly: 850, pro_annual: 6600, cookbook: 3300, cookbook_pro_first: 2640 },
};

function offeringsIn(requested: string | undefined, prices = BACKEND) {
  const currency = requested && prices[requested] ? requested : "USD";
  const pack = (id: string) => ({
    identifier: id,
    webBillingProduct: {
      identifier: id,
      price: { currency, amountMicros: Math.round(prices[currency][id] * 1_000_000) },
    },
  });
  const offering = (ids: string[]) => {
    const packages = ids.map(pack);
    return {
      availablePackages: packages,
      packagesById: Object.fromEntries(packages.map((entry) => [entry.identifier, entry])),
    };
  };
  return {
    current: null,
    all: {
      pro: offering(["pro_monthly", "pro_annual"]),
      cookbook: offering(["cookbook", "cookbook_pro_first"]),
    },
  };
}

const sdk = vi.hoisted(() => ({
  configure: vi.fn(),
  getOfferings: vi.fn(),
  purchase: vi.fn(),
  getCustomerInfo: vi.fn(),
}));

vi.mock("@revenuecat/purchases-js", () => ({
  ErrorCode: { UserCancelledError: 1 },
  Purchases: { configure: sdk.configure },
}));

const NO_PURCHASES = { entitlements: { all: {}, active: {} } } as unknown as CustomerInfo;

function visitFrom(country: string, { localCurrencies }: { localCurrencies: boolean }) {
  document.cookie = `rp_country=${country}; path=/`;
  if (localCurrencies) vi.stubEnv("NEXT_PUBLIC_LOCAL_CURRENCIES", "on");
}

function knownToRevenueCat() {
  window.localStorage.setItem("recipeprinter:revenuecat-known-customer:v1", "1");
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_REVENUECAT_WEB_API_KEY", "rcb_sb_test");
  window.localStorage.clear();
  sdk.getOfferings.mockReset().mockImplementation(async (params?: { currency?: string }) =>
    offeringsIn(params?.currency),
  );
  sdk.getCustomerInfo.mockReset().mockResolvedValue(NO_PURCHASES);
  sdk.purchase.mockReset().mockResolvedValue({ customerInfo: NO_PURCHASES });
  sdk.configure.mockReset().mockReturnValue({
    getOfferings: sdk.getOfferings,
    purchase: sdk.purchase,
    getCustomerInfo: sdk.getCustomerInfo,
    setAttributes: vi.fn().mockResolvedValue(undefined),
    changeUser: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkout", () => {
  test("charges the currency the page quoted, for a subscription and a cookbook alike", async () => {
    visitFrom("CA", { localCurrencies: true });
    const purchases = await import("./recipePrinterPurchases");

    await purchases.purchaseRecipePrinterPro({ userId: "uid", cycle: "annual" });
    await purchases.purchaseRecipePrinterCookbook({ userId: "uid", projectId: "p1", discountEligible: true });

    expect(sdk.getOfferings.mock.calls.map(([params]) => params)).toEqual([
      { currency: "CAD" },
      { currency: "CAD" },
    ]);
    const sold = sdk.purchase.mock.calls.map(([params]) => params.rcPackage.webBillingProduct);
    expect(sold.map((product) => [product.identifier, product.price.currency])).toEqual([
      ["pro_annual", "CAD"],
      ["cookbook_pro_first", "CAD"],
    ]);
  });

  test("names dollars while local currencies are off, rather than letting RevenueCat choose", async () => {
    visitFrom("CA", { localCurrencies: false });
    const purchases = await import("./recipePrinterPurchases");

    await purchases.purchaseRecipePrinterPro({ userId: "uid", cycle: "monthly" });

    expect(sdk.getOfferings).toHaveBeenCalledWith({ currency: "USD" });
    expect(sdk.purchase.mock.calls[0][0].rcPackage.webBillingProduct.price.currency).toBe("USD");
  });

  test("names dollars for a country with no configured currency", async () => {
    visitFrom("MX", { localCurrencies: true });
    const purchases = await import("./recipePrinterPurchases");

    await purchases.purchaseRecipePrinterPro({ userId: "uid", cycle: "monthly" });

    expect(sdk.getOfferings).toHaveBeenCalledWith({ currency: "USD" });
  });
});

describe("the prices on screen", () => {
  test("a visitor RevenueCat does not know is quoted from the table, and the SDK is never configured", async () => {
    visitFrom("CA", { localCurrencies: true });
    const purchases = await import("./recipePrinterPurchases");
    const { useVisitorPrices } = await import("./visitorCurrency");

    expect(await purchases.loadRecipePrinterCustomerInfo("$RCAnonymousID:0123456789abcdef")).toBeNull();
    const { result } = renderHook(() => useVisitorPrices());

    expect(result.current.currency).toBe("CAD");
    expect(result.current.label("$4.99/mo")).toMatch(/7\.49\/mo$/);
    expect(sdk.configure).not.toHaveBeenCalled();
    expect(sdk.getOfferings).not.toHaveBeenCalled();
  });

  test("a known customer is quoted RevenueCat's own prices, in the currency checkout will use", async () => {
    visitFrom("CA", { localCurrencies: true });
    knownToRevenueCat();
    // RevenueCat disagrees with the built-in table: RevenueCat is what gets charged.
    sdk.getOfferings.mockImplementation(async (params?: { currency?: string }) =>
      offeringsIn(params?.currency, { ...BACKEND, CAD: { ...BACKEND.CAD, pro_monthly: 7.99, pro_annual: 63.99 } }),
    );
    const purchases = await import("./recipePrinterPurchases");
    const { useVisitorPrices } = await import("./visitorCurrency");
    const { result } = renderHook(() => useVisitorPrices());

    await purchases.loadRecipePrinterCustomerInfo("uid");

    await waitFor(() => expect(result.current.label("$4.99/mo")).toMatch(/7\.99\/mo$/));
    expect(sdk.getOfferings).toHaveBeenCalledWith({ currency: "CAD" });
    // 1 - 63.99 / (7.99 * 12) = 33.26%
    expect(result.current.annualSavingsPercent).toBe(33);
    expect(result.current.label("$15.99")).toMatch(/23\.99$/);
  });

  test("a currency with no cents is read at the right scale", async () => {
    visitFrom("JP", { localCurrencies: true });
    knownToRevenueCat();
    const purchases = await import("./recipePrinterPurchases");
    const { useVisitorPrices } = await import("./visitorCurrency");
    const { result } = renderHook(() => useVisitorPrices());
    const fromTable = result.current.label("$39.99/yr");

    await purchases.loadRecipePrinterCustomerInfo("uid");

    await waitFor(() => expect(sdk.getOfferings).toHaveBeenCalledWith({ currency: "JPY" }));
    expect(fromTable).toMatch(/6,600\/yr$/);
    expect(result.current.label("$39.99/yr")).toBe(fromTable);
  });

  test("if RevenueCat answers in dollars, dollars are what the page shows", async () => {
    visitFrom("CA", { localCurrencies: true });
    knownToRevenueCat();
    sdk.getOfferings.mockImplementation(async () => offeringsIn("USD"));
    const purchases = await import("./recipePrinterPurchases");
    const { useVisitorPrices } = await import("./visitorCurrency");
    const { result } = renderHook(() => useVisitorPrices());

    await purchases.loadRecipePrinterCustomerInfo("uid");

    await waitFor(() => expect(result.current.currency).toBe("USD"));
    expect(result.current.label("$19.99")).toBe("US$19.99");
  });
});

describe("an existing subscriber's plan", () => {
  test("is quoted at what they are billed, in the currency they are billed in", async () => {
    visitFrom("CA", { localCurrencies: true });
    const { proPaidPrice } = await import("./recipePrinterPurchases");
    const subscribedInDollars = {
      entitlements: { all: { pro: { productIdentifier: "pro_annual" } }, active: {} },
      subscriptionsByProductIdentifier: {
        pro_annual: { price: { currency: "USD", amountMicros: 39_990_000 } },
      },
    } as unknown as CustomerInfo;

    expect(proPaidPrice(subscribedInDollars)).toEqual({ amount: 3999, currency: "USD" });
  });

  test("is not guessed when RevenueCat does not say what they pay", async () => {
    const { proPaidPrice } = await import("./recipePrinterPurchases");
    const granted = {
      entitlements: { all: { pro: { productIdentifier: "pro_monthly" } }, active: {} },
    } as unknown as CustomerInfo;

    expect(proPaidPrice(granted)).toBeNull();
    expect(proPaidPrice(null)).toBeNull();
  });
});
