import { describe, expect, it } from "vitest";
import {
  postPrintPrompt,
  purchaseGate,
  revenueCatIdentityTransition,
} from "./purchaseAccess";
import { computeProLocks } from "./recipePrinterPurchases";
import { resolveEffectiveCustomerInfo } from "./proAccessFallback";

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

describe("sign-out / sign-in and account switching (revenueCatIdentityTransition)", () => {
  it("signing out and back in as the SAME account reuses the identity already configured — no re-alias, no gap in entitlements", () => {
    expect(revenueCatIdentityTransition("user-a", "user-a")).toBe("reuse");
  });

  it("a DIFFERENT user signing into the same browser switches identity outright — user A's entitlements are never aliased onto user B", () => {
    expect(revenueCatIdentityTransition("user-a", "user-b")).toBe("switch");
  });

  it("a guest purchase is claimed (aliased) the first time an account signs in, not switched away from", () => {
    expect(revenueCatIdentityTransition("$RCAnonymousID:guest123", "user-a")).toBe("identify");
  });
});

describe("purchaseGate driven end-to-end by resolveEffectiveCustomerInfo (fallback reliability)", () => {
  const NOW = Date.parse("2026-06-01T00:00:00Z");

  function proLockedFor(mirroredEntitlements: Parameters<typeof resolveEffectiveCustomerInfo>[0]["mirroredEntitlements"]) {
    const effective = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "error",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements,
      mirrorSyncedAtMs: NOW - 1_000,
      nowMs: NOW,
    });
    return computeProLocks({
      customerInfo: effective.customerInfo,
      cookbookMode: false,
      template: "classic",
      selectedPremiumTemplate: null,
      cardSize: "card-6x4",
      recipeCount: 1,
    }).proLocked;
  }

  it("a RevenueCat outage with a valid, unexpired mirror still lets an already-paying user continue", () => {
    const proLocked = proLockedFor({
      pro: { active: true, expiresAtMs: NOW + 1_000_000, productIdentifier: "pro_monthly", willRenew: true },
    });
    expect(purchaseGate({ cookbookLocked: false, proLocked })).toBe("continue");
  });

  it("a RevenueCat outage with a mirror that's actually past its real expiration still gates Pro — the fallback never grants access forever", () => {
    const proLocked = proLockedFor({
      pro: { active: true, expiresAtMs: NOW - 1_000_000, productIdentifier: "pro_monthly", willRenew: true },
    });
    expect(purchaseGate({ cookbookLocked: false, proLocked })).toBe("unlock-pro");
  });

  it("a RevenueCat outage with no mirror at all (never subscribed) fails locked, same as today", () => {
    const effective = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "error",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements: null,
      mirrorSyncedAtMs: null,
      nowMs: NOW,
    });
    const { proLocked } = computeProLocks({
      customerInfo: effective.customerInfo,
      cookbookMode: false,
      template: "classic",
      selectedPremiumTemplate: null,
      cardSize: "card-6x4",
      recipeCount: 1,
    });
    expect(purchaseGate({ cookbookLocked: false, proLocked })).toBe("unlock-pro");
  });
});
