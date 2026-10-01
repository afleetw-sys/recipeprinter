// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useProPurchase } from "./useProPurchase";

/**
 * The guard against selling Pro twice, and its one deliberate exception.
 *
 * `purchaseProAndContinue` refuses to start checkout while Pro is active, so a
 * double click or a stale dialog can't start a second subscription. That same
 * guard is what made Resubscribe a dead button for a canceled subscriber (it
 * started a checkout the guard refused). Resubscribe now goes to the billing
 * portal instead, and only opens checkout — with `allowWhileActive` — when the
 * server has confirmed there is no subscription behind the Pro at all.
 */

// `vi.mock` is hoisted above the imports, so the spy has to be too.
const { purchaseRecipePrinterPro } = vi.hoisted(() => ({ purchaseRecipePrinterPro: vi.fn() }));
vi.mock("@/lib/recipePrinterPurchases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipePrinterPurchases")>()),
  purchaseRecipePrinterPro,
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), truncateReason: (e: unknown) => String(e) }));

function customer(proActive: boolean): CustomerInfo {
  const pro = { identifier: "pro", isActive: true, willRenew: false, productIdentifier: "pro_monthly", expirationDate: null };
  const entitlements = proActive ? { pro } : {};
  return { entitlements: { active: entitlements, all: entitlements } } as unknown as CustomerInfo;
}

function setup(proActive: boolean) {
  return renderHook(() =>
    useProPurchase({
      revenueCatUserId: "user-1",
      customerInfo: customer(proActive),
      setCustomerInfo: vi.fn(),
      markCustomerInfoVerified: vi.fn(),
      cookPilotUser: null,
      showToast: vi.fn(),
      clearToast: vi.fn(),
      onFreshPurchase: vi.fn(),
    }),
  );
}

afterEach(() => {
  purchaseRecipePrinterPro.mockReset();
});

describe("useProPurchase", () => {
  test("never starts a second checkout while Pro is active", async () => {
    const { result } = setup(true);
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue("monthly", onSettled));
    expect(purchaseRecipePrinterPro).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith("already-active");
  });

  test("checks out a cook without Pro", async () => {
    purchaseRecipePrinterPro.mockResolvedValue({ customerInfo: customer(true), cancelled: false });
    const { result } = setup(false);
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue("annual", onSettled));
    expect(purchaseRecipePrinterPro).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", cycle: "annual" }));
    expect(onSettled).toHaveBeenCalledWith("purchased");
  });

  test("allowWhileActive lets Pro with no subscription behind it buy one", async () => {
    purchaseRecipePrinterPro.mockResolvedValue({ customerInfo: customer(true), cancelled: false });
    const { result } = setup(true);
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue("monthly", onSettled, { allowWhileActive: true }));
    expect(purchaseRecipePrinterPro).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("purchased");
  });
});
