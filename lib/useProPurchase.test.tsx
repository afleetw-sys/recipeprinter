// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const purchases = vi.hoisted(() => ({
  loadRecipePrinterCustomerInfo: vi.fn(),
  purchaseRecipePrinterPro: vi.fn(),
  waitForProEntitlement: vi.fn(),
}));

vi.mock("@/lib/recipePrinterPurchases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipePrinterPurchases")>()),
  ...purchases,
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), truncateReason: () => "reason" }));

import { useProPurchase } from "./useProPurchase";

const NO_PRO = { entitlements: { active: {}, all: {} } } as unknown as CustomerInfo;
const PRO = { entitlements: { active: { pro: {} }, all: { pro: {} } } } as unknown as CustomerInfo;
const MONTHLY = { cycle: "monthly", autoRenew: true } as const;
const ONE_MONTH = { cycle: "monthly", autoRenew: false } as const;

function setup(customerInfo: CustomerInfo | null = NO_PRO) {
  const options = {
    revenueCatUserId: "user-1",
    customerInfo,
    acceptCustomerInfo: vi.fn(),
    cookPilotUser: null,
    showToast: vi.fn(),
    showErrorToast: vi.fn(),
    clearToast: vi.fn(),
  };
  const { result } = renderHook(() => useProPurchase(options));
  return { options, result };
}

beforeEach(() => {
  purchases.loadRecipePrinterCustomerInfo.mockResolvedValue(NO_PRO);
  purchases.purchaseRecipePrinterPro.mockResolvedValue({ customerInfo: PRO, cancelled: false });
  purchases.waitForProEntitlement.mockResolvedValue(PRO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useProPurchase", () => {
  it("buys Pro and settles as purchased", async () => {
    const { options, result } = setup();
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue(MONTHLY, onSettled));
    expect(purchases.purchaseRecipePrinterPro).toHaveBeenCalledTimes(1);
    expect(options.acceptCustomerInfo).toHaveBeenCalledWith(PRO);
    expect(onSettled).toHaveBeenCalledWith("purchased");
  });

  it("never opens checkout when a fresh read shows Pro the last read missed (a late one-month grant)", async () => {
    purchases.loadRecipePrinterCustomerInfo.mockResolvedValue(PRO);
    const { options, result } = setup(NO_PRO);
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue(ONE_MONTH, onSettled));
    expect(purchases.purchaseRecipePrinterPro).not.toHaveBeenCalled();
    expect(options.acceptCustomerInfo).toHaveBeenCalledWith(PRO);
    expect(onSettled).toHaveBeenCalledWith("already-active");
  });

  it("still checks out when the fresh read fails, as before", async () => {
    purchases.loadRecipePrinterCustomerInfo.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue(MONTHLY, onSettled));
    expect(purchases.purchaseRecipePrinterPro).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("purchased");
  });

  it("opens one checkout when started twice in the same tick", async () => {
    const { result } = setup();
    const first = vi.fn();
    const second = vi.fn();
    await act(() =>
      Promise.all([
        result.current.purchaseProAndContinue(MONTHLY, first),
        result.current.purchaseProAndContinue(MONTHLY, second),
      ]),
    );
    expect(purchases.purchaseRecipePrinterPro).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith("purchased");
    expect(second).not.toHaveBeenCalled();
  });

  it("a one-month grant that hasn't landed yet does not ask the cook to buy again", async () => {
    purchases.purchaseRecipePrinterPro.mockResolvedValue({ customerInfo: NO_PRO, cancelled: false });
    purchases.waitForProEntitlement.mockResolvedValue(NO_PRO);
    const { options, result } = setup();
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue(ONE_MONTH, onSettled));
    expect(onSettled).toHaveBeenCalledWith("failed");
    const message = options.showErrorToast.mock.calls[0][0] as string;
    expect(message).not.toMatch(/try again/i);
    expect(message).toMatch(/purchase went through/i);
  });

  it("does nothing new for an account whose loaded info already has Pro", async () => {
    const { result } = setup(PRO);
    const onSettled = vi.fn();
    await act(() => result.current.purchaseProAndContinue(MONTHLY, onSettled));
    expect(purchases.loadRecipePrinterCustomerInfo).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith("already-active");
  });
});
