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
      customerInfo: customer(proActive),
      setCustomerInfo: vi.fn(),
      markCustomerInfoVerified: vi.fn(),
      cookPilotUser: { uid: "user-1", email: null } as never,
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

  // 2026-11-03: a cook who signed in inside the upgrade dialog on /print got
  // two checkouts 2ms apart (the dialog's onChoose and the page's
  // resume-after-sign-in effect). RevenueCat refused the second with backend
  // error 7638, "another request in flight", and Stripe showed "Something went
  // wrong" over the real one.
  test("a second request while checkout is open starts nothing, and settles nothing", async () => {
    let finish!: (value: { customerInfo: CustomerInfo; cancelled: boolean }) => void;
    purchaseRecipePrinterPro.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = setup(false);
    const first = vi.fn();
    const second = vi.fn();

    let pending!: Promise<void>;
    act(() => {
      // Same tick, same render: neither caller can see the other's busy state.
      pending = result.current.purchaseProAndContinue("monthly", first);
      void result.current.purchaseProAndContinue("monthly", second);
    });
    await act(async () => {
      finish({ customerInfo: customer(true), cancelled: false });
      await pending;
    });

    expect(purchaseRecipePrinterPro).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith("purchased");
    // The dropped request must not settle too, or a print waiting on it runs twice.
    expect(second).not.toHaveBeenCalled();

    // Once the first checkout settles, a new one can start.
    purchaseRecipePrinterPro.mockResolvedValue({ customerInfo: customer(true), cancelled: false });
    await act(() => result.current.purchaseProAndContinue("annual", vi.fn(), { allowWhileActive: true }));
    expect(purchaseRecipePrinterPro).toHaveBeenCalledTimes(2);
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

/**
 * Signed in is enough to buy. RevenueCat used to be asked as whatever id the
 * page held: nothing while the sign-in link was still out (or for good once it
 * failed, a dead "Purchases aren't ready yet" button), or the guest id when a
 * plan was chosen signed out and checkout fired straight after signing in.
 * Now checkout links the account first and buys as its uid, and the account's
 * own entitlement still stops a second subscription.
 */
describe("useProPurchase as a signed-in account", () => {
  const account = { uid: "uid-1", email: "cook@example.com" } as never;

  function setupLinking(linked: CustomerInfo) {
    const linkCustomer = vi.fn().mockResolvedValue(linked);
    const hook = renderHook(() =>
      useProPurchase({
        customerInfo: null,
        setCustomerInfo: vi.fn(),
        markCustomerInfoVerified: vi.fn(),
        cookPilotUser: account,
        linkCustomer,
        showToast: vi.fn(),
        clearToast: vi.fn(),
        onFreshPurchase: vi.fn(),
      }),
    );
    return { ...hook, linkCustomer };
  }

  test("links the account, then buys as it, unless linking shows Pro already", async () => {
    purchaseRecipePrinterPro.mockResolvedValue({ customerInfo: customer(true), cancelled: false });
    const unlinked = setupLinking(customer(false));
    const onSettled = vi.fn();
    await act(() => unlinked.result.current.purchaseProAndContinue("monthly", onSettled));
    expect(unlinked.linkCustomer).toHaveBeenCalledWith("uid-1");
    expect(purchaseRecipePrinterPro).toHaveBeenCalledWith(expect.objectContaining({ userId: "uid-1" }));
    expect(onSettled).toHaveBeenCalledWith("purchased");

    purchaseRecipePrinterPro.mockClear();
    const alreadyPro = setupLinking(customer(true));
    const onSettledAgain = vi.fn();
    await act(() => alreadyPro.result.current.purchaseProAndContinue("monthly", onSettledAgain));
    expect(purchaseRecipePrinterPro).not.toHaveBeenCalled();
    expect(onSettledAgain).toHaveBeenCalledWith("already-active");
  });
});
