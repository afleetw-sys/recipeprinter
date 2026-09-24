import { recipePrinterUserPath } from "@/lib/firebase/recipePrinterPaths";
import { localStore } from "@/lib/storage";

/**
 * Whether the Pro dialog's "Not upgrading today?" question has been asked
 * (components/ProUpgradeDialog.tsx). It is asked once per person, ever: once
 * per browser, and once per account wherever that account signs in. A second
 * device is only asked again when we have no way to know it is the same
 * person, which means signed out.
 *
 * Every doubt resolves to "already asked": a question we skip costs one
 * answer, a question asked twice costs the promise.
 */

const DEVICE_KEY = "rp:pro-decline-asked-at";
/** Write-once, server clock. firestore.rules allows exactly this key. */
const ACCOUNT_FIELD = "proDeclineAskedAt";

/** True when this browser has asked, or cannot remember whether it has. */
export function proDeclineAskedOnDevice(): boolean {
  if (!localStore.available()) return true;
  return localStore.get(DEVICE_KEY) !== null;
}

/** Rejects when the account could not be read; callers treat that as asked. */
export async function loadProDeclineAskedOnAccount(uid: string): Promise<boolean> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snapshot = await getDoc(doc(getDb(), ...recipePrinterUserPath(uid)));
  return snapshot.get(ACCOUNT_FIELD) != null;
}

/** Best effort on both sides; a failed account write only costs cross-device memory. */
export async function markProDeclineAsked(uid: string | null): Promise<void> {
  localStore.set(DEVICE_KEY, String(Date.now()));
  if (!uid) return;
  try {
    const [{ doc, serverTimestamp, updateDoc }, { getDb }] = await Promise.all([
      import("firebase/firestore"),
      import("@/lib/firebase/db"),
    ]);
    await updateDoc(doc(getDb(), ...recipePrinterUserPath(uid)), {
      [ACCOUNT_FIELD]: serverTimestamp(),
    });
  } catch (error) {
    console.warn("RecipePrinter: could not record the Pro decline question on the account", error);
  }
}
