import type { PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";

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
 * Centralized RecipePrinter user-profile read: everything gated on the
 * shared CookPilot `users/{uid}` Firestore doc (admin flag, free-template
 * claim status) is derived from one `getDoc`, not one per gate — a signed-in
 * `/print` visit used to fire two independent reads of this same doc.
 */
export interface RecipePrinterUserProfile {
  isAdmin: boolean;
  freeTemplateStatus: RecipePrinterFreeTemplateStatus;
}

async function fetchRecipePrinterUserDoc(uid: string): Promise<Record<string, unknown>> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snap = await getDoc(doc(getDb(), "users", uid));
  return snap.data() ?? {};
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
 * of the same doc alongside the admin check.
 */
export async function loadFreeTemplateStatus(
  uid: string,
): Promise<RecipePrinterFreeTemplateStatus> {
  return deriveFreeTemplateStatus(await fetchRecipePrinterUserDoc(uid));
}

/** Single read of `users/{uid}` powering both the admin gate and free-template status. */
export async function loadRecipePrinterUserProfile(uid: string): Promise<RecipePrinterUserProfile> {
  const data = await fetchRecipePrinterUserDoc(uid);
  return {
    isAdmin: data.recipePrinterAdmin === true,
    freeTemplateStatus: deriveFreeTemplateStatus(data),
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
