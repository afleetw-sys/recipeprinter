import { describe, expect, test } from "vitest";
import {
  hasProEntitlement,
  hasTemplateOrProEntitlement,
  proSubscriptionDetails,
} from "./recipePrinterPurchases";
import {
  resolveEffectiveCustomerInfo,
  synthesizeCustomerInfoFromMirror,
} from "./proAccessFallback";
import type { RecipePrinterMirroredEntitlement } from "./recipePrinterUserProfile";

const NOW = Date.parse("2026-06-01T00:00:00Z");

function mirrorEntry(overrides: Partial<RecipePrinterMirroredEntitlement> = {}): RecipePrinterMirroredEntitlement {
  return {
    active: false,
    expiresAtMs: null,
    productIdentifier: null,
    willRenew: null,
    ...overrides,
  };
}

describe("synthesizeCustomerInfoFromMirror", () => {
  test("an active, not-yet-expired pro entitlement synthesizes as active", () => {
    const info = synthesizeCustomerInfoFromMirror(
      {
        pro: mirrorEntry({ active: true, expiresAtMs: NOW + 1_000_000, productIdentifier: "pro_monthly" }),
      },
      NOW,
    );
    expect(hasProEntitlement(info)).toBe(true);
  });

  test("re-derives isActive against nowMs — an entry that's since passed its recorded expiry is NOT active, even if `active: true` was mirrored", () => {
    const info = synthesizeCustomerInfoFromMirror(
      { pro: mirrorEntry({ active: true, expiresAtMs: NOW - 1_000_000, productIdentifier: "pro_monthly" }) },
      NOW,
    );
    expect(hasProEntitlement(info)).toBe(false);
  });

  test("a null expiration on a subscription entitlement (pro) is never treated as lifetime", () => {
    const info = synthesizeCustomerInfoFromMirror(
      { pro: mirrorEntry({ active: true, expiresAtMs: null, productIdentifier: "pro_monthly" }) },
      NOW,
    );
    expect(hasProEntitlement(info)).toBe(false);
  });

  test("a null expiration on a legacy template entitlement is still treated as lifetime", () => {
    const info = synthesizeCustomerInfoFromMirror(
      { template_heirloom: mirrorEntry({ active: true, expiresAtMs: null, productIdentifier: "rp_template_heirloom" }) },
      NOW,
    );
    expect(hasTemplateOrProEntitlement(info, "heirloom")).toBe(true);
  });

  test("willRenew round-trips so proSubscriptionDetails reads 'canceled but active' correctly in fallback mode", () => {
    const info = synthesizeCustomerInfoFromMirror(
      {
        pro: mirrorEntry({
          active: true,
          expiresAtMs: NOW + 1_000_000,
          productIdentifier: "pro_annual",
          willRenew: false,
        }),
      },
      NOW,
    );
    const details = proSubscriptionDetails(info);
    expect(details.active).toBe(true);
    expect(details.willRenew).toBe(false);
    expect(details.cycle).toBe("annual");
  });
});

describe("resolveEffectiveCustomerInfo", () => {
  const activeMirror = {
    pro: mirrorEntry({ active: true, expiresAtMs: NOW + 1_000_000, productIdentifier: "pro_monthly" }),
  };
  const expiredMirror = {
    pro: mirrorEntry({ active: true, expiresAtMs: NOW - 1_000_000, productIdentifier: "pro_monthly" }),
  };

  test("a successful live fetch is always trusted, even when it shows an active entitlement", () => {
    const liveCustomerInfo = synthesizeCustomerInfoFromMirror(activeMirror, NOW);
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo,
      liveStatus: "ok",
      liveLastVerifiedAtMs: NOW,
      mirroredEntitlements: expiredMirror,
      mirrorSyncedAtMs: NOW - 5_000,
      nowMs: NOW,
    });
    expect(result.source).toBe("live");
    expect(result.stale).toBe(false);
    expect(hasProEntitlement(result.customerInfo)).toBe(true);
  });

  test("a successful live fetch that shows nothing is trusted too — it never falls back to a stale mirror", () => {
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "ok",
      liveLastVerifiedAtMs: NOW,
      mirroredEntitlements: activeMirror,
      mirrorSyncedAtMs: NOW - 5_000,
      nowMs: NOW,
    });
    expect(result.source).toBe("live");
    expect(hasProEntitlement(result.customerInfo)).toBe(false);
  });

  test("a live failure with a valid, unexpired mirror falls back to it — an already-verified paying user keeps access", () => {
    const mirrorSyncedAtMs = NOW - 60_000;
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "error",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements: activeMirror,
      mirrorSyncedAtMs,
      nowMs: NOW,
    });
    expect(result.source).toBe("mirror-fallback");
    expect(result.stale).toBe(true);
    expect(hasProEntitlement(result.customerInfo)).toBe(true);
    // The "last verified at" timestamp is the mirror's own real sync time,
    // not a made-up or approximate value.
    expect(result.lastVerifiedAtMs).toBe(mirrorSyncedAtMs);
  });

  test("a live failure with a mirror that's past its real expiration fails locked — fallback never grants access forever", () => {
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "error",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements: expiredMirror,
      mirrorSyncedAtMs: NOW - 60_000,
      nowMs: NOW,
    });
    expect(result.source).toBe("none");
    expect(result.customerInfo).toBeNull();
  });

  test("a live failure with no mirror at all fails locked", () => {
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "error",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements: null,
      mirrorSyncedAtMs: null,
      nowMs: NOW,
    });
    expect(result.source).toBe("none");
    expect(result.stale).toBe(true);
    expect(result.customerInfo).toBeNull();
  });

  test("a mirror covering a legacy template but not Pro falls back correctly for the template only", () => {
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "error",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements: {
        template_bistro: mirrorEntry({ active: true, expiresAtMs: null, productIdentifier: "rp_template_bistro" }),
        pro: mirrorEntry({ active: false }),
      },
      mirrorSyncedAtMs: NOW - 1_000,
      nowMs: NOW,
    });
    expect(result.source).toBe("mirror-fallback");
    expect(hasTemplateOrProEntitlement(result.customerInfo, "bistro")).toBe(true);
    expect(hasProEntitlement(result.customerInfo)).toBe(false);
  });

  test("the idle (not-yet-fetched) state is not reported as a stale failure", () => {
    const result = resolveEffectiveCustomerInfo({
      liveCustomerInfo: null,
      liveStatus: "idle",
      liveLastVerifiedAtMs: null,
      mirroredEntitlements: null,
      mirrorSyncedAtMs: null,
      nowMs: NOW,
    });
    expect(result.source).toBe("none");
    expect(result.stale).toBe(false);
  });
});
