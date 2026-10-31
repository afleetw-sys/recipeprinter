// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useCookbookPurchase } from "./useCookbookPurchase";

/**
 * A cookbook is only sold to an account.
 *
 * A signed-out purchase was recorded against an anonymous RevenueCat id and
 * meant to reach the account on a TRANSFER event at sign-in. Signing up turns
 * that id into an alias instead, which sends no TRANSFER, so the buyer signed
 * in to "We couldn't find this cookbook on your account" with no way to pay
 * again (a customer report, 2026-10-31). Signed out, Buy now asks for sign-in
 * and never opens checkout.
 */

const { purchaseRecipePrinterCookbook } = vi.hoisted(() => ({
  purchaseRecipePrinterCookbook: vi.fn(),
}));
vi.mock("@/lib/recipePrinterPurchases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipePrinterPurchases")>()),
  purchaseRecipePrinterCookbook,
}));
vi.mock("@/lib/cookbookUnlocks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cookbookUnlocks")>()),
  loadCookbookProjectUnlock: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), truncateReason: (e: unknown) => String(e) }));

function setup(cookPilotUser: User | null) {
  const onSignInRequired = vi.fn();
  const hook = renderHook(() =>
    useCookbookPurchase({
      revenueCatUserId: cookPilotUser ? cookPilotUser.uid : "$RCAnonymousID:0123456789abcdef0123456789abcdef",
      cookPilotUser,
      cookbookMode: true,
      projectId: "book-1",
      discountEligible: false,
      showToast: vi.fn(),
      clearToast: vi.fn(),
      onFreshPurchase: vi.fn(),
      onCookbookGranted: vi.fn(),
      onSignInRequired,
    }),
  );
  return { ...hook, onSignInRequired };
}

afterEach(() => {
  purchaseRecipePrinterCookbook.mockReset();
  window.localStorage.clear();
});

describe("useCookbookPurchase", () => {
  test("checkout needs an account: signed out asks for sign-in, signed in buys", async () => {
    const signedOut = setup(null);
    const onUnlocked = vi.fn();
    await act(() => signedOut.result.current.purchaseCookbookAndContinue(onUnlocked));
    expect(purchaseRecipePrinterCookbook).not.toHaveBeenCalled();
    expect(signedOut.onSignInRequired).toHaveBeenCalledTimes(1);
    expect(onUnlocked).not.toHaveBeenCalled();

    purchaseRecipePrinterCookbook.mockResolvedValue({ cancelled: false });
    const signedIn = setup({ uid: "uid-1", email: "cook@example.com" } as User);
    await act(() => signedIn.result.current.purchaseCookbookAndContinue(onUnlocked));
    expect(purchaseRecipePrinterCookbook).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "uid-1", projectId: "book-1" }),
    );
    expect(signedIn.onSignInRequired).not.toHaveBeenCalled();
    expect(onUnlocked).toHaveBeenCalledWith(true);
  });
});
