import { describe, expect, it } from "vitest";
import {
  postPrintPrompt,
  purchaseGate,
  revenueCatIdentityTransition,
} from "./purchaseAccess";

describe("paid purchase access", () => {
  it("opens the appropriate paywall without requiring authentication", () => {
    expect(
      purchaseGate({ cookbookLocked: true, templateLocked: false }),
    ).toBe("unlock-cookbook");
    expect(
      purchaseGate({ cookbookLocked: false, templateLocked: true }),
    ).toBe("unlock-template");
  });

  it("does not block free or previously unlocked printing", () => {
    expect(
      purchaseGate({ cookbookLocked: false, templateLocked: false }),
    ).toBe("continue");
  });

  it("protects a fresh purchase instead of asking for a donation", () => {
    expect(postPrintPrompt("protect-purchase", false)).toBe("protect-purchase");
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
