import type { CustomerInfo } from "@revenuecat/purchases-js";
import { PREMIUM_TEMPLATE_ENTITLEMENTS } from "@/lib/premiumTemplates";
import type { RecipePrinterMirroredEntitlement } from "@/lib/recipePrinterFreeTemplateClaim";

// Only a one-time legacy template purchase is a legitimate "no expiration
// means lifetime" entitlement — see CookPilot's matching rule in
// functions/src/recipePrinterRevenueCat.ts (`LIFETIME_ELIGIBLE_ENTITLEMENTS`).
// Enforced here too, independently, as defense in depth: even if the
// server-side mirror were ever wrong, this fallback must never grant Pro (or
// any future subscription entitlement) forever just because its recorded
// expiration happens to be missing.
const LIFETIME_ELIGIBLE_ENTITLEMENT_IDS = new Set<string>(
  Object.values(PREMIUM_TEMPLATE_ENTITLEMENTS),
);

/**
 * Builds a `CustomerInfo`-shaped object from the Firestore-mirrored
 * entitlement map, so every existing predicate in lib/recipePrinterPurchases.ts
 * (`hasProEntitlement`, `hasTemplateEntitlement`, `hasTemplateOrProEntitlement`,
 * `canUseCardSize`, `hasMultiRecipeEntitlement`, `proSubscriptionDetails`)
 * keeps working completely unchanged, fed either the live SDK's answer or
 * this one — there is exactly one set of "what does this customer own"
 * functions, never two.
 *
 * Recomputes `isActive` against `nowMs` at READ time rather than trusting the
 * mirror's own `active` flag from whenever it was last synced — this is what
 * stops a long-stale mirror from granting access forever after a real
 * expiration, with no extra bookkeeping. And a missing expiration is only
 * ever treated as "active forever" for the lifetime-eligible entitlements
 * (the legacy one-time templates); every other entitlement (a subscription —
 * `pro` today) with no expiration on file is treated as NOT active, because a
 * real subscription always carries one and a missing one is an anomaly, not
 * a lifetime grant.
 */
export function synthesizeCustomerInfoFromMirror(
  mirroredEntitlements: Record<string, RecipePrinterMirroredEntitlement>,
  nowMs: number,
): CustomerInfo {
  const all: Record<string, unknown> = {};
  const active: Record<string, unknown> = {};

  for (const [entitlementId, entitlement] of Object.entries(mirroredEntitlements)) {
    const isLifetimeEligible = LIFETIME_ELIGIBLE_ENTITLEMENT_IDS.has(entitlementId);
    const isActive =
      entitlement.expiresAtMs !== null
        ? entitlement.active && entitlement.expiresAtMs > nowMs
        : entitlement.active && isLifetimeEligible;

    const info = {
      identifier: entitlementId,
      isActive,
      willRenew: entitlement.willRenew ?? false,
      productIdentifier: entitlement.productIdentifier,
      expirationDate: entitlement.expiresAtMs === null ? null : new Date(entitlement.expiresAtMs),
    };
    all[entitlementId] = info;
    if (isActive) active[entitlementId] = info;
  }

  return { entitlements: { active, all } } as unknown as CustomerInfo;
}

export type CustomerInfoLoadStatus = "idle" | "ok" | "error";
export type EffectiveCustomerInfoSource = "live" | "mirror-fallback" | "none";

export interface EffectiveCustomerInfo {
  customerInfo: CustomerInfo | null;
  source: EffectiveCustomerInfoSource;
  /** True only when this reflects an actual live-check failure (a real
   *  outage), not the ordinary "haven't fetched yet" state on first paint. */
  stale: boolean;
  /** When this answer was actually verified against RevenueCat: the live
   *  fetch's own timestamp when `source === "live"`, or the mirror's real,
   *  persisted sync time when falling back to it — never made up or
   *  approximated. Null when there is nothing to point to yet. */
  lastVerifiedAtMs: number | null;
}

/**
 * Decides which `CustomerInfo`-shaped value every entitlement predicate
 * should actually be fed: the live RevenueCat SDK read whenever it succeeded
 * — even if it shows nothing, since a confirmed "no entitlement" from
 * RevenueCat always beats a possibly-stale mirror — or, only when the live
 * check itself failed (network down, RevenueCat unreachable), a synthesized
 * fallback built from the last server-verified mirror, bounded by that
 * mirror's own recorded expiration so it can never grant access forever
 * after a subscription has actually lapsed.
 */
export function resolveEffectiveCustomerInfo({
  liveCustomerInfo,
  liveStatus,
  liveLastVerifiedAtMs,
  mirroredEntitlements,
  mirrorSyncedAtMs,
  nowMs,
}: {
  liveCustomerInfo: CustomerInfo | null;
  liveStatus: CustomerInfoLoadStatus;
  liveLastVerifiedAtMs: number | null;
  mirroredEntitlements: Record<string, RecipePrinterMirroredEntitlement> | null;
  mirrorSyncedAtMs: number | null;
  nowMs: number;
}): EffectiveCustomerInfo {
  if (liveStatus === "ok") {
    return {
      customerInfo: liveCustomerInfo,
      source: "live",
      stale: false,
      lastVerifiedAtMs: liveLastVerifiedAtMs,
    };
  }

  if (mirroredEntitlements) {
    const synthesized = synthesizeCustomerInfoFromMirror(mirroredEntitlements, nowMs);
    const hasAnyActive = Object.keys(synthesized.entitlements.active).length > 0;
    if (hasAnyActive) {
      return {
        customerInfo: synthesized,
        source: "mirror-fallback",
        stale: true,
        lastVerifiedAtMs: mirrorSyncedAtMs,
      };
    }
  }

  return {
    customerInfo: null,
    source: "none",
    stale: liveStatus === "error",
    lastVerifiedAtMs: liveLastVerifiedAtMs,
  };
}
