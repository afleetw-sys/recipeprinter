import { PREMIUM_TEMPLATE_ENTITLEMENTS, type PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";
import { RECIPEPRINTER_PRO_ENTITLEMENT_ID } from "@/lib/proProduct";
import { recipePrinterUserPath } from "@/lib/firebase/recipePrinterPaths";

// Mirrors CookPilot's revenueCat.ts LIFETIME_EXPIRY_MS sentinel for a
// non-expiring entitlement (Firestore Timestamps round-trip as millis here).
const LIFETIME_EXPIRY_MS = Date.UTC(9999, 0, 1);

export interface RecipePrinterFreeTemplateStatus {
  /** Live: is the signed-in CookPilot account an active subscriber right now. */
  cookPilotActive: boolean;
  /** Entitlement id already claimed (reserved), or null if nothing claimed yet. */
  granted: string | null;
  /** Whether the claim above has been confirmed (the RevenueCat grant succeeded). */
  grantedConfirmed: boolean;
}

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
 * shared CookPilot `users/{uid}` Firestore doc (free-template claim status,
 * mirrored entitlements) is derived from one `getDoc`, not one per gate — a
 * signed-in `/print` visit used to fire two independent reads of this same
 * doc.
 */
export interface RecipePrinterUserProfile {
  freeTemplateStatus: RecipePrinterFreeTemplateStatus;
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
   * whole profile load — taking the admin gate and the free-template status
   * down with a read that has nothing to do with either. The two other places
   * that read a legacy path beside a namespaced one (lib/printProjects,
   * lib/cookbookUnlocks) isolate each side for exactly this reason.
   *
   * And when NEITHER answers, that is not a profile — it is the absence of one.
   * Returning `{}` would say "not a CookPilot subscriber, nothing claimed"
   * with total confidence, which is the same lie an unread projects list used
   * to tell. The caller on /print already treats a rejection
   * correctly: it leaves `freeTemplateStatus` null, which reads as unknown
   * rather than as a subscriber being told they have no free template.
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

function deriveFreeTemplateStatus(data: Record<string, unknown>): RecipePrinterFreeTemplateStatus {
  const expiresAtMs = (data.plusExpiresAt as { toMillis?: () => number } | undefined)
    ?.toMillis?.() ?? null;

  return {
    cookPilotActive:
      expiresAtMs !== null && (expiresAtMs >= LIFETIME_EXPIRY_MS || expiresAtMs > Date.now()),
    granted:
      typeof data.recipePrinterFreeTemplateGranted === "string"
        ? data.recipePrinterFreeTemplateGranted
        : null,
    grantedConfirmed: Boolean(data.recipePrinterFreeTemplateGrantedAt),
  };
}

/**
 * Reads free-template claim status off the shared CookPilot Firestore user
 * doc. Firestore rules already let a signed-in user read their own doc, so
 * this is a plain client read — no callable needed. Used on its own right
 * after a claim, where a fresh read is the point; for the general-purpose
 * page load, prefer `loadRecipePrinterUserProfile` so it isn't a second read
 * of the same doc alongside the rest of the profile.
 */
export async function loadFreeTemplateStatus(
  uid: string,
): Promise<RecipePrinterFreeTemplateStatus> {
  return deriveFreeTemplateStatus(await fetchRecipePrinterUserDoc(uid));
}

/** Single read of `users/{uid}` powering the free-template status and the
 *  mirrored-entitlement fallback. */
export async function loadRecipePrinterUserProfile(uid: string): Promise<RecipePrinterUserProfile> {
  const data = await fetchRecipePrinterUserDoc(uid);
  return {
    freeTemplateStatus: deriveFreeTemplateStatus(data),
    mirroredEntitlements: deriveMirroredEntitlements(data),
    syncedAtMs: deriveSyncedAtMs(data),
    firstCookbookGrantedAt: deriveFirstCookbookGrantedAt(data),
  };
}

/** Calls CookPilot's `claimRecipePrinterFreeTemplate` callable. */
export async function claimFreeRecipePrinterTemplate(
  template: PremiumRecipePrintTemplate,
): Promise<{ success: true; template: string; entitlementId: string }> {
  const [{ httpsCallable }, { getFns }] = await Promise.all([
    import("firebase/functions"),
    import("@/lib/firebase/functions"),
  ]);
  const claim = httpsCallable<
    { template: PremiumRecipePrintTemplate },
    { success: true; template: string; entitlementId: string }
  >(getFns(), "claimRecipePrinterFreeTemplate");
  const { data } = await claim({ template });
  return data;
}
