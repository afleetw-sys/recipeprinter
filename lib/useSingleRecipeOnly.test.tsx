// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { uid: string } }));
vi.mock("@/components/CookPilotAuth", () => ({ useCookPilotAuth: () => ({ user: auth.user }) }));

const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/recipePrinterPurchases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipePrinterPurchases")>()),
  loadRecipePrinterCustomerInfo: load,
}));

import { useSingleRecipeOnly } from "./useSingleRecipeOnly";

const PRO = { entitlements: { active: { pro: {} }, all: {} } };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.user = null;
});

describe("useSingleRecipeOnly", () => {
  it("lifts the limit for a Pro account", async () => {
    load.mockResolvedValue(PRO);
    auth.user = { uid: "alice" };
    const { result } = renderHook(() => useSingleRecipeOnly());
    await act(async () => undefined);
    expect(result.current).toBe(false);
  });

  it("stays single-recipe, quietly, when the entitlement can't be read", async () => {
    load.mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    auth.user = { uid: "alice" };
    const { result } = renderHook(() => useSingleRecipeOnly());
    await act(async () => undefined);
    expect(result.current).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("does not re-read RevenueCat when a token refresh hands out a new User for the same account", async () => {
    load.mockResolvedValue(PRO);
    auth.user = { uid: "alice" };
    const { rerender } = renderHook(() => useSingleRecipeOnly());
    await act(async () => undefined);
    auth.user = { uid: "alice" };
    rerender();
    await act(async () => undefined);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
