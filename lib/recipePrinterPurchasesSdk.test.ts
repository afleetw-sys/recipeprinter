import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The SDK-facing half of lib/recipePrinterPurchases.ts: configuring the
 * RevenueCat client once, switching identity, resolving which package a
 * checkout sells, and how a checkout settles. The pure entitlement predicates
 * are covered in recipePrinterPurchases.test.ts; these need a fake SDK.
 */

const sdk = vi.hoisted(() => ({
  configure: vi.fn(),
  instance: null as null | Record<string, ReturnType<typeof vi.fn>>,
  offerings: null as unknown,
}));

vi.mock("@revenuecat/purchases-js", () => ({
  ErrorCode: { UserCancelledError: 1 },
  Purchases: { configure: sdk.configure },
}));

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}
const memory = new MemoryStorage();

function fakePackage(identifier: string, productId: string) {
  return { identifier, webBillingProduct: { identifier: productId } };
}

/** Mirrors the SDK: `packagesById` is keyed from the same list as `availablePackages`. */
function fakeOffering(packages: ReturnType<typeof fakePackage>[]) {
  return {
    availablePackages: packages,
    packagesById: Object.fromEntries(packages.map((pkg) => [pkg.identifier, pkg])),
  };
}

function makeInstance() {
  return {
    changeUser: vi.fn(async () => undefined),
    getCustomerInfo: vi.fn(async () => ({ entitlements: { active: {}, all: {} } })),
    getOfferings: vi.fn(async () => sdk.offerings),
    purchase: vi.fn(async () => ({ customerInfo: { entitlements: { active: { pro: {} }, all: {} } } })),
    setAttributes: vi.fn(async () => undefined),
    identifyUser: vi.fn(async () => ({ customerInfo: { entitlements: { active: {}, all: {} } }, wasCreated: false })),
  };
}

async function freshModule() {
  vi.resetModules();
  return import("./recipePrinterPurchases");
}

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: memory } });
  vi.stubEnv("NEXT_PUBLIC_REVENUECAT_WEB_API_KEY", "test-key");
  sdk.configure.mockReset();
  sdk.configure.mockImplementation(() => {
    sdk.instance = makeInstance();
    return sdk.instance;
  });
  sdk.offerings = { all: {}, current: null };
});

describe("SDK configuration", () => {
  it("never configures (never mints a customer) for a browser that has never purchased or signed in", async () => {
    const purchases = await freshModule();
    expect(await purchases.loadRecipePrinterCustomerInfo("anon")).toBeNull();
    expect(sdk.configure).not.toHaveBeenCalled();
  });

  it("configures once for concurrent first callers, and remembers the customer exists", async () => {
    const purchases = await freshModule();
    const [a, b] = await Promise.all([
      purchases.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }).catch(() => null),
      purchases.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }).catch(() => null),
    ]);
    void a; void b;
    expect(sdk.configure).toHaveBeenCalledTimes(1);
    expect(sdk.configure).toHaveBeenCalledWith({ apiKey: "test-key", appUserId: "u1" });
    expect(sdk.instance?.changeUser).not.toHaveBeenCalled();
    // Now a known customer, so the read-only path is allowed to configure.
    expect(await purchases.loadRecipePrinterCustomerInfo("u1")).not.toBeNull();
  });

  it("switches identity on the existing instance instead of configuring again", async () => {
    const purchases = await freshModule();
    await purchases.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }).catch(() => null);
    await purchases.loadRecipePrinterCustomerInfo("u2");
    await purchases.loadRecipePrinterCustomerInfo("u2");
    expect(sdk.configure).toHaveBeenCalledTimes(1);
    expect(sdk.instance?.changeUser).toHaveBeenCalledTimes(1);
    expect(sdk.instance?.changeUser).toHaveBeenCalledWith("u2");
  });

  it("a configure that throws is retried on the next call rather than cached", async () => {
    const purchases = await freshModule();
    sdk.configure.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(
      purchases.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }),
    ).rejects.toThrow("boom");
    await purchases.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }).catch(() => null);
    expect(sdk.configure).toHaveBeenCalledTimes(2);
  });
});

describe("package resolution", () => {
  function offeringsWith(id: string, packages: ReturnType<typeof fakePackage>[], current = false) {
    const offering = fakeOffering(packages);
    return { all: current ? {} : { [id]: offering }, current: current ? offering : null };
  }

  async function soldPackage(run: (purchases: Awaited<ReturnType<typeof freshModule>>) => Promise<unknown>) {
    const purchases = await freshModule();
    await run(purchases);
    return sdk.instance?.purchase.mock.calls[0]?.[0]?.rcPackage;
  }

  it("sells each Pro plan by its product id", async () => {
    sdk.offerings = offeringsWith("pro", [
      fakePackage("pro_monthly", "pro_monthly"),
      fakePackage("pro_annual", "pro_annual"),
      fakePackage("pro_one_month", "pro_one_month"),
    ]);
    for (const [plan, product] of [
      [{ cycle: "monthly", autoRenew: true }, "pro_monthly"],
      [{ cycle: "annual", autoRenew: true }, "pro_annual"],
      [{ cycle: "annual", autoRenew: false }, "pro_annual"],
      [{ cycle: "monthly", autoRenew: false }, "pro_one_month"],
    ] as const) {
      const pkg = await soldPackage((p) => p.purchaseRecipePrinterPro({ userId: "u1", plan }));
      expect(pkg.webBillingProduct.identifier).toBe(product);
    }
  });

  it("finds the product even when its package id was renamed in the dashboard", async () => {
    sdk.offerings = offeringsWith("pro", [fakePackage("$rc_monthly", "pro_monthly")]);
    const pkg = await soldPackage((p) =>
      p.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }),
    );
    expect(pkg.identifier).toBe("$rc_monthly");
  });

  it("refuses a package whose id matches but which sells a different product", async () => {
    sdk.offerings = offeringsWith("pro", [fakePackage("pro_monthly", "something_else")]);
    const purchases = await freshModule();
    await expect(
      purchases.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "monthly", autoRenew: true } }),
    ).rejects.toThrow("RecipePrinter Pro isn't ready to buy yet.");
    expect(sdk.instance?.purchase).not.toHaveBeenCalled();
  });

  it("falls back to the current offering when the named one is missing", async () => {
    sdk.offerings = offeringsWith("pro", [fakePackage("pro_annual", "pro_annual")], true);
    const pkg = await soldPackage((p) =>
      p.purchaseRecipePrinterPro({ userId: "u1", plan: { cycle: "annual", autoRenew: true } }),
    );
    expect(pkg.identifier).toBe("pro_annual");
  });

  it("sells the regular or discounted cookbook, and tags the project", async () => {
    sdk.offerings = offeringsWith("cookbook", [
      fakePackage("cookbook", "cookbook"),
      fakePackage("cookbook_pro_first", "cookbook_pro_first"),
    ]);
    for (const [discountEligible, product] of [[false, "cookbook"], [true, "cookbook_pro_first"]] as const) {
      const purchases = await freshModule();
      await purchases.purchaseRecipePrinterCookbook({ userId: "u1", projectId: "book-1", discountEligible });
      expect(sdk.instance?.purchase.mock.calls[0][0].rcPackage.webBillingProduct.identifier).toBe(product);
      expect(sdk.instance?.setAttributes).toHaveBeenCalledWith({ cookbook_project_id: "book-1" });
    }
  });

  it("refuses the cookbook when neither product is offered", async () => {
    sdk.offerings = offeringsWith("cookbook", [fakePackage("cookbook", "pro_monthly")]);
    const purchases = await freshModule();
    await expect(
      purchases.purchaseRecipePrinterCookbook({ userId: "u1", projectId: "b", discountEligible: false }),
    ).rejects.toThrow("The cookbook upgrade isn't ready to buy yet.");
  });
});

describe("checkout settling", () => {
  beforeEach(() => {
    sdk.offerings = { all: { pro: fakeOffering([fakePackage("pro_monthly", "pro_monthly")]) }, current: null };
  });
  const plan = { cycle: "monthly", autoRenew: true } as const;

  it("returns the purchase's customer info", async () => {
    const purchases = await freshModule();
    const result = await purchases.purchaseRecipePrinterPro({ userId: "u1", plan, email: "a@b.c" });
    expect(result.cancelled).toBe(false);
    expect(sdk.instance?.purchase.mock.calls[0][0]).toMatchObject({ customerEmail: "a@b.c", skipSuccessPage: true });
  });

  it("turns a user cancel into `cancelled`, re-reading the customer", async () => {
    const purchases = await freshModule();
    await purchases.loadRecipePrinterCustomerInfo("u1"); // no-op: not known yet
    sdk.configure.mockImplementationOnce(() => {
      sdk.instance = makeInstance();
      sdk.instance.purchase.mockRejectedValueOnce({ errorCode: 1 });
      return sdk.instance;
    });
    const result = await purchases.purchaseRecipePrinterPro({ userId: "u1", plan });
    expect(result.cancelled).toBe(true);
    expect(sdk.instance?.getCustomerInfo).toHaveBeenCalled();
  });

  it("rethrows any other failure", async () => {
    const purchases = await freshModule();
    sdk.configure.mockImplementationOnce(() => {
      sdk.instance = makeInstance();
      sdk.instance.purchase.mockRejectedValueOnce({ errorCode: 7 });
      return sdk.instance;
    });
    await expect(purchases.purchaseRecipePrinterPro({ userId: "u1", plan })).rejects.toEqual({ errorCode: 7 });
  });
});
