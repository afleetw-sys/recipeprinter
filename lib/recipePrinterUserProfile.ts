import { PREMIUM_TEMPLATE_ENTITLEMENTS } from "@/lib/premiumTemplates";
import { RECIPEPRINTER_PRO_ENTITLEMENT_ID } from "@/lib/proProduct";
import { recipePrinterUserPath } from "@/lib/firebase/recipePrinterPaths";

/**
 * One entitlement as the server last confirmed it — `recipePrinterEntitlements.{id}`,
 * written only by the RevenueCat webhook (CookPilot's
 * functions/src/recipePrinterRevenueCat.ts), never by the client
 * (firestore.rules denies it — see `serverOwnedSharedUserFields`). Every
 * mirrored entitlement (the four legacy templates and `pro`) is covered, not
 * just Pro, so a legacy theme owner's fallback works the same way a Pro
 * subscriber's does — see lib/proAccessFallback.ts, the only consumer that
 * should read this map for a gating decision.
 */
export interface RecipePrinterMirroredEntitlement {
  active: boolean;
  expiresAtMs: number | null;
  productIdentifier: string | null;
  /** Null when the server never recorded one (a lifetime template, or an
   *  entitlement that's never existed for this account) — "unknown," not
   *  "false." */
  willRenew: boolean | null;
}

// Every entitlement id the webhook mirrors — must match
// RECIPEPRINTER_MIRRORED_ENTITLEMENTS in CookPilot's
// functions/src/recipePrinterRevenueCat.ts (separate repo, kept in sync by
// hand, same as the ids themselves already are).
const MIRRORED_ENTITLEMENT_IDS = [
  ...Object.values(PREMIUM_TEMPLATE_ENTITLEMENTS),
  RECIPEPRINTER_PRO_ENTITLEMENT_ID,
];

/**
 * Centralized RecipePrinter user-profile read: everything gated on the
 * shared CookPilot `users/{uid}` Firestore doc (mirrored entitlements, the
 * first-cookbook grant) is derived from one read, not one per gate.
 */
export interface RecipePrinterUserProfile {
  mirroredEntitlements: Record<string, RecipePrinterMirroredEntitlement>;
  /** When the webhook last successfully verified this account against
   *  RevenueCat (`recipePrinterRevenueCatSyncedAt`) — null if it's never
   *  synced. This is the real "last verified at ___" timestamp used
   *  whenever a fallback actually falls back to this mirror; never made up
   *  or approximated (lib/proAccessFallback.ts). */
  syncedAtMs: number | null;
  /** When this account's first-ever cookbook was granted
   *  (`recipePrinterFirstCookbookGrantedAt`, write-once by CookPilot's
   *  `recordFirstCookbookGrant`) — null means never. The only consumer
   *  should be `isFirstCookbookDiscountEligible` in lib/cookbookProduct.ts;
   *  this field says nothing about *access* to any specific cookbook,
   *  which stays the separate per-project unlock doc it's always been. */
  firstCookbookGrantedAt: number | null;
}

async function fetchRecipePrinterUserDoc(uid: string): Promise<Record<string, unknown>> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  /**
   * Both reads guarded, and a total failure reported rather than answered.
   *
   * Only the namespaced half was `.catch`-guarded, so a permission error or a
   * dropped connection on the pre-namespace `users/{uid}` document rejected the
   * whole profile load — taking the mirrored-entitlement fallback down with a
   * read that has nothing to do with it. The two other places
   * that read a legacy path beside a namespaced one (lib/printProjects,
   * lib/cookbookUnlocks) isolate each side for exactly this reason.
   *
   * And when NEITHER answers, that is not a profile — it is the absence of one.
   * Returning `{}` would say "nothing is mirrored for this account" with total
   * confidence, which is the same lie an unread projects list used to tell. The
   * caller on /print already treats a rejection correctly: it leaves the mirror
   * fields as they were, which reads as unknown rather than as a subscriber
   * being told they own nothing.
   */
  const [namespaced, legacy] = await Promise.all([
    getDoc(doc(db, ...recipePrinterUserPath(uid))).catch(() => null),
    getDoc(doc(db, "users", uid)).catch(() => null),
  ]);
  if (!namespaced && !legacy) {
    throw new Error("Couldn't read your account profile.");
  }
  return { ...(legacy?.data() ?? {}), ...(namespaced?.data() ?? {}) };
}

type RawMirroredEntitlement = {
  active?: unknown;
  expiresAt?: { toMillis?: () => number } | null;
  productIdentifier?: unknown;
  willRenew?: unknown;
} | undefined;

function deriveMirroredEntitlements(
  data: Record<string, unknown>,
): Record<string, RecipePrinterMirroredEntitlement> {
  const raw = data.recipePrinterEntitlements as Record<string, RawMirroredEntitlement> | undefined;
  const resolved: Record<string, RecipePrinterMirroredEntitlement> = {};
  for (const entitlementId of MIRRORED_ENTITLEMENT_IDS) {
    const entitlement = raw?.[entitlementId];
    resolved[entitlementId] = {
      active: entitlement?.active === true,
      expiresAtMs: entitlement?.expiresAt?.toMillis?.() ?? null,
      productIdentifier: typeof entitlement?.productIdentifier === "string" ? entitlement.productIdentifier : null,
      willRenew: typeof entitlement?.willRenew === "boolean" ? entitlement.willRenew : null,
    };
  }
  return resolved;
}

function deriveSyncedAtMs(data: Record<string, unknown>): number | null {
  const syncedAt = data.recipePrinterRevenueCatSyncedAt as { toMillis?: () => number } | undefined;
  return syncedAt?.toMillis?.() ?? null;
}

function deriveFirstCookbookGrantedAt(data: Record<string, unknown>): number | null {
  const grantedAt = data.recipePrinterFirstCookbookGrantedAt as { toMillis?: () => number } | undefined;
  return grantedAt?.toMillis?.() ?? null;
}

/** Single read of `users/{uid}` powering the mirrored-entitlement fallback and
 *  the first-cookbook discount. */
export async function loadRecipePrinterUserProfile(uid: string): Promise<RecipePrinterUserProfile> {
  const data = await fetchRecipePrinterUserDoc(uid);
  return {
    mirroredEntitlements: deriveMirroredEntitlements(data),
    syncedAtMs: deriveSyncedAtMs(data),
    firstCookbookGrantedAt: deriveFirstCookbookGrantedAt(data),
  };
}
