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
 * Reads free-template claim status off the shared CookPilot Firestore user
 * doc. Firestore rules already let a signed-in user read their own doc, so
 * this is a plain client read — no callable needed.
 */
export async function loadFreeTemplateStatus(
  uid: string,
): Promise<RecipePrinterFreeTemplateStatus> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snap = await getDoc(doc(getDb(), "users", uid));
  const data = snap.data() ?? {};
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
