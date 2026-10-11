// @vitest-environment jsdom
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * Pro granted by hand in RevenueCat, to an account that has never bought
 * anything, in a browser that has never checked out.
 *
 * Nothing in that browser says "this is a customer", and the read used to be
 * skipped for exactly that reason, so the account stayed Free on every reload.
 * A signed-in account is always worth asking about; an anonymous visitor still
 * is not, and must not get a customer record out of being asked.
 */

const sdk = vi.hoisted(() => ({ configure: vi.fn(), getCustomerInfo: vi.fn() }));

vi.mock("@revenuecat/purchases-js", () => ({
  ErrorCode: { UserCancelledError: 1 },
  Purchases: { configure: sdk.configure },
}));

// A promotional grant with unlimited duration: active, and no end date.
const GRANTED_PRO = {
  identifier: "pro",
  isActive: true,
  willRenew: false,
  productIdentifier: "rc_promo_pro_lifetime",
  expirationDate: null,
};
const GRANTED = {
  entitlements: { all: { pro: GRANTED_PRO }, active: { pro: GRANTED_PRO } },
} as unknown as CustomerInfo;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_REVENUECAT_WEB_API_KEY", "rcb_sb_test");
  window.localStorage.clear();
  sdk.getCustomerInfo.mockReset().mockResolvedValue(GRANTED);
  sdk.configure.mockReset().mockReturnValue({
    getCustomerInfo: sdk.getCustomerInfo,
    getOfferings: vi.fn().mockResolvedValue({ current: null, all: {} }),
    changeUser: vi.fn().mockResolvedValue(undefined),
  });
});

test("a signed-in account is asked about even in a browser that never purchased; an anonymous visitor is not", async () => {
  const purchases = await import("./recipePrinterPurchases");

  const anonymous = await purchases.loadRecipePrinterCustomerInfo("$RCAnonymousID:0123456789abcdef");
  expect(anonymous).toBeNull();
  expect(sdk.configure).not.toHaveBeenCalled();

  const account = await purchases.loadRecipePrinterCustomerInfo("firebaseUid123");
  expect(purchases.hasProEntitlement(account)).toBe(true);
});
