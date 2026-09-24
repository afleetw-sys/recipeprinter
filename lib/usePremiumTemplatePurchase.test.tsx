// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/types/recipe";

const purchases = vi.hoisted(() => ({
  identifyRecipePrinterCustomer: vi.fn(),
  loadRecipePrinterCustomerInfo: vi.fn(),
  recipePrinterCustomerId: vi.fn(),
  syncRecipePrinterCustomerAttributes: vi.fn(),
}));
vi.mock("@/lib/recipePrinterPurchases", () => purchases);

import { usePremiumTemplatePurchase } from "./usePremiumTemplatePurchase";

const alice = { uid: "alice" } as User;
const oneItem = [{ id: "a" }] as unknown as QueueItem[];

function renderIdentity(initial: { items: QueueItem[] | null; user: User | null }) {
  return renderHook(
    ({ items, user }) =>
      usePremiumTemplatePurchase({
        items,
        cookPilotUser: user,
        cookPilotAuthReady: true,
        template: "classic",
        showToast: vi.fn(),
      }),
    { initialProps: initial },
  );
}

beforeEach(() => {
  purchases.identifyRecipePrinterCustomer.mockResolvedValue({
    customerInfo: { entitlements: { active: {}, all: {} } },
    alreadyLinked: true,
  });
  purchases.loadRecipePrinterCustomerInfo.mockResolvedValue(null);
  purchases.recipePrinterCustomerId.mockResolvedValue("$RCAnonymousID:guest");
  purchases.syncRecipePrinterCustomerAttributes.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RevenueCat identity on /print", () => {
  it("resolves a signed-in account on an empty page, so Pro can be bought there", async () => {
    const { result } = renderIdentity({ items: [], user: alice });
    await act(async () => undefined);
    expect(purchases.identifyRecipePrinterCustomer).toHaveBeenCalledWith("alice");
    expect(result.current.revenueCatUserId).toBe("alice");
  });

  it("identifies a signed-in account once, not again when its recipes arrive", async () => {
    const { rerender } = renderIdentity({ items: [], user: alice });
    await act(async () => undefined);
    rerender({ items: oneItem, user: alice });
    await act(async () => undefined);
    expect(purchases.identifyRecipePrinterCustomer).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a signed-out visitor with nothing to print", async () => {
    const { result } = renderIdentity({ items: [], user: null });
    await act(async () => undefined);
    expect(purchases.recipePrinterCustomerId).not.toHaveBeenCalled();
    expect(result.current.revenueCatUserId).toBeNull();
  });

  it("gives a signed-out visitor with a recipe a local anonymous id, without loading the SDK", async () => {
    const { result } = renderIdentity({ items: oneItem, user: null });
    await act(async () => undefined);
    expect(result.current.revenueCatUserId).toBe("$RCAnonymousID:guest");
    expect(purchases.identifyRecipePrinterCustomer).not.toHaveBeenCalled();
  });
});
