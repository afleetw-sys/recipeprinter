// @vitest-environment jsdom
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook } from "@testing-library/react";
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
// The purchase hooks below: no events, and no Firestore for a cookbook's unlock.
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), truncateReason: (e: unknown) => String(e) }));
vi.mock("@/lib/cookbookUnlocks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cookbookUnlocks")>()),
  loadCookbookProjectUnlock: vi.fn().mockResolvedValue(false),
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

/**
 * Checkout pressed straight after signing in, the usual first purchase
 * (purchases need an account). Sign-in's own link of the account to RevenueCat
 * may still be out, and the hooks wait for it before buying, so nothing is ever
 * bought as the guest id. Stripe.js doesn't depend on who is buying, so it
 * downloads during that wait instead of after it.
 */
const afterSignIn = {
  pro: async (linkCustomer: () => Promise<null>) => {
    const { useProPurchase } = await import("./useProPurchase");
    const { result } = renderHook(() =>
      useProPurchase({
        linkCustomer,
        customerInfo: NO_PURCHASES,
        setCustomerInfo: vi.fn(),
        markCustomerInfoVerified: vi.fn(),
        cookPilotUser: { uid: "uid", email: null } as never,
        showToast: vi.fn(),
        clearToast: vi.fn(),
        onFreshPurchase: vi.fn(),
      }),
    );
    return () => result.current.purchaseProAndContinue("annual", vi.fn());
  },
  cookbook: async (linkCustomer: () => Promise<null>) => {
    const { useCookbookPurchase } = await import("./useCookbookPurchase");
    const { result } = renderHook(() =>
      useCookbookPurchase({
        cookPilotUser: { uid: "uid", email: null } as never,
        cookbookMode: true,
        projectId: "p1",
        discountEligible: false,
        showToast: vi.fn(),
        clearToast: vi.fn(),
        onFreshPurchase: vi.fn(),
        onCookbookGranted: vi.fn(),
        onSignInRequired: vi.fn(),
        linkCustomer,
      }),
    );
    return () => result.current.purchaseCookbookAndContinue(vi.fn());
  },
};

test.each(Object.keys(afterSignIn) as (keyof typeof afterSignIn)[])(
  "%s checkout right after sign-in: Stripe.js downloads while the account is still being linked",
  async (product) => {
    sdk.getOfferings.mockResolvedValue(offerings());
    sdk.preload.mockResolvedValue(undefined);
    sdk.setAttributes.mockResolvedValue(undefined);
    const linked = held(null);
    const linkCustomer = vi.fn(() => linked.answered);
    const press = await afterSignIn[product](linkCustomer);

    let done!: Promise<void>;
    act(() => {
      done = press();
    });
    await act(flush);

    expect(linkCustomer).toHaveBeenCalledWith("uid");
    expect(stripeScripts()).toHaveLength(1);
    // Nothing that depends on who is buying goes out before the link lands.
    expect(sdk.getOfferings).not.toHaveBeenCalled();
    expect(sdk.purchase).not.toHaveBeenCalled();

    await act(async () => {
      linked.release();
      await done;
    });
    expect(sdk.purchase).toHaveBeenCalledTimes(1);
    // The one Stripe.js, not a second copy at the purchase call.
    expect(stripeScripts()).toHaveLength(1);
  },
);
