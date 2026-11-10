// @vitest-environment jsdom
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * The payment form appears as fast as RevenueCat and Stripe allow.
 *
 * Measured 2026-11-10 (sandbox key, one cold browser): click → Stripe form took
 * 2.9 s, because every request waited for the one before it: offerings, then
 * products, then the cookbook attribute (itself two requests), then
 * RevenueCat's branding, then checkout/start, then Stripe.js, then Stripe's
 * frames. A customer gave up after 11 s on a phone.
 *
 * Only checkout/start and what follows it genuinely need the click. So:
 * offerings and branding are fetched as soon as a signed-in customer is
 * configured (and reused at the click), and at the click everything else that
 * checkout/start waits for, Stripe.js included, starts at once.
 */

const sdk = vi.hoisted(() => ({
  configure: vi.fn(),
  getOfferings: vi.fn(),
  preload: vi.fn(),
  setAttributes: vi.fn(),
  purchase: vi.fn(),
  getCustomerInfo: vi.fn(),
}));

vi.mock("@revenuecat/purchases-js", () => ({
  ErrorCode: { UserCancelledError: 1 },
  Purchases: { configure: sdk.configure },
}));

const NO_PURCHASES = { entitlements: { all: {}, active: {} } } as unknown as CustomerInfo;

function offerings() {
  const pack = (id: string) => ({
    identifier: id,
    webBillingProduct: { identifier: id, price: { currency: "USD", amountMicros: 1_000_000 } },
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
    all: { pro: offering(["pro_monthly", "pro_annual"]), cookbook: offering(["cookbook", "cookbook_pro_first"]) },
  };
}

/** A request that stays in flight until the test lets it answer. */
function held<T>(value: T) {
  let release!: () => void;
  const answered = new Promise<T>((resolve) => {
    release = () => resolve(value);
  });
  return { answered, release };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Read from the installed SDK, so an upgrade that moves Stripe.js on fails here. */
function sdkStripeVersion() {
  const bundle = readFileSync(join(process.cwd(), "node_modules/@revenuecat/purchases-js/dist/Purchases.es.js"), "utf8");
  const version = /var \w+ = "([a-z]+)", \w+ = function\(e\) \{\s*return e === 3 \? "v3"/.exec(bundle)?.[1];
  if (!version) throw new Error("Could not find the Stripe.js version in purchases-js");
  return version;
}

const stripeScripts = () => document.head.querySelectorAll('script[src^="https://js.stripe.com/"]');

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_REVENUECAT_WEB_API_KEY", "rcb_sb_test");
  window.localStorage.clear();
  document.head.innerHTML = "";
  for (const fn of Object.values(sdk)) fn.mockReset();
  sdk.getCustomerInfo.mockResolvedValue(NO_PURCHASES);
  sdk.purchase.mockResolvedValue({ customerInfo: NO_PURCHASES });
  sdk.configure.mockReturnValue({
    getOfferings: sdk.getOfferings,
    preload: sdk.preload,
    setAttributes: sdk.setAttributes,
    purchase: sdk.purchase,
    getCustomerInfo: sdk.getCustomerInfo,
    changeUser: vi.fn().mockResolvedValue(undefined),
  });
});

const checkouts = {
  pro: (purchases: typeof import("./recipePrinterPurchases")) =>
    purchases.purchaseRecipePrinterPro({ userId: "uid", cycle: "annual" }),
  cookbook: (purchases: typeof import("./recipePrinterPurchases")) =>
    purchases.purchaseRecipePrinterCookbook({ userId: "uid", projectId: "p1", discountEligible: false }),
};

test.each(Object.keys(checkouts) as (keyof typeof checkouts)[])(
  "%s checkout: nothing before checkout/start waits on another request, and what can be fetched before the click is",
  async (product) => {
    // At the click, cold: every request is held, and all of them must already
    // be in flight together, Stripe.js among them.
    const offered = held(offerings());
    const branded = held(undefined);
    const attributed = held(undefined);
    sdk.getOfferings.mockReturnValue(offered.answered);
    sdk.preload.mockReturnValue(branded.answered);
    sdk.setAttributes.mockReturnValue(attributed.answered);

    let purchases = await import("./recipePrinterPurchases");
    const done = checkouts[product](purchases);
    await flush();

    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
    expect(sdk.preload).toHaveBeenCalledTimes(1);
    if (product === "cookbook") expect(sdk.setAttributes).toHaveBeenCalledTimes(1);
    // The version RevenueCat's own Stripe loader asks for, or it would load a
    // second copy instead of reusing this one.
    expect(Array.from(stripeScripts()).map((script) => script.getAttribute("src"))).toEqual([
      `https://js.stripe.com/${sdkStripeVersion()}/stripe.js`,
    ]);
    expect(sdk.purchase).not.toHaveBeenCalled();

    offered.release();
    branded.release();
    attributed.release();
    await done;
    expect(sdk.purchase).toHaveBeenCalledTimes(1);

    // A signed-in customer: reading who they are fetches offerings and
    // branding, and the click then asks for neither again.
    vi.resetModules();
    for (const fn of [sdk.getOfferings, sdk.purchase]) fn.mockClear();
    sdk.getOfferings.mockResolvedValue(offerings());
    // Like the SDK's own `preload()`: one branding fetch, then a no-op.
    let brandingFetches = 0;
    sdk.preload.mockReset().mockImplementation(async () => {
      if (brandingFetches === 0) brandingFetches += 1;
    });
    purchases = await import("./recipePrinterPurchases");
    await purchases.loadRecipePrinterCustomerInfo("uid");
    await flush();
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
    expect(brandingFetches).toBe(1);

    await checkouts[product](purchases);
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
    expect(brandingFetches).toBe(1);
    expect(sdk.purchase).toHaveBeenCalledTimes(1);
  },
);
