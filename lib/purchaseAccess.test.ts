import { describe, expect, it } from "vitest";
import {
  postPrintPrompt,
  purchaseGate,
  revenueCatIdentityTransition,
} from "./purchaseAccess";

describe("paid purchase access", () => {
  it("opens the appropriate paywall without requiring authentication", () => {
    expect(
      purchaseGate({ cookbookLocked: true, proLocked: false }),
    ).toBe("unlock-cookbook");
    expect(
      purchaseGate({ cookbookLocked: false, proLocked: true }),
    ).toBe("unlock-pro");
  });

  it("prefers the cookbook gate when both are locked", () => {
    expect(
      purchaseGate({ cookbookLocked: true, proLocked: true }),
    ).toBe("unlock-cookbook");
  });

  it("does not block free or previously unlocked printing", () => {
    expect(
      purchaseGate({ cookbookLocked: false, proLocked: false }),
    ).toBe("continue");
  });

  it("shows nothing after a Pro or cookbook purchase, which have their own prompts", () => {
    expect(postPrintPrompt("none", false)).toBeNull();
  });

  it("shows the donation prompt at most once", () => {
    expect(postPrintPrompt("donate", false)).toBe("donate");
    expect(postPrintPrompt("donate", true)).toBeNull();
  });

  it("aliases a new anonymous purchase even when the account was linked before", () => {
    expect(
      revenueCatIdentityTransition("$RCAnonymousID:new-guest-purchase", "existing-account"),
    ).toBe("identify");
    expect(revenueCatIdentityTransition("existing-account", "existing-account")).toBe("reuse");
    expect(revenueCatIdentityTransition("another-account", "existing-account")).toBe("switch");
  });
});
