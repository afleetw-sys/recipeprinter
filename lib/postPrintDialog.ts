import { recipePrinterUserPath } from "@/lib/firebase/recipePrinterPaths";
import { localStore } from "@/lib/storage";

/**
 * Whether the "Leave feedback / Support RecipePrinter" dialog has been shown
 * (components/PrintDialogs.tsx). It shows once per person, ever, after their
 * first card print or download or their second card import, whichever comes
 * first: once per browser, and once per account wherever that account signs
 * in (the same shape as lib/proDeclineAsked.ts).
 *
 * A new key on purpose (Amelia, 2026-10-26): it came back in the place of the
 * referral invite, and everyone sees this version once, including a browser
 * that saw the old feedback dialog (`post-print-dialog:last-shown:v1`) or the
 * invite.
 *
 * A browser that blocks site data can't remember it, so there it's once per
 * page rather than never.
 */
export const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:feedback-prompt-seen:v2";
/** Write-once, server clock. firestore.rules allows exactly this key. */
const ACCOUNT_FIELD = "feedbackPromptSeenAt";

let shownThisPage = false;

export function shouldShowPostPrintDialog(): boolean {
  return !shownThisPage && localStore.get(POST_PRINT_DIALOG_STORAGE_KEY) === null;
}

/** Rejects when the account could not be read; callers treat that as seen. */
export async function loadPostPrintDialogSeenOnAccount(uid: string): Promise<boolean> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snapshot = await getDoc(doc(getDb(), ...recipePrinterUserPath(uid)));
  return snapshot.get(ACCOUNT_FIELD) != null;
}

/** Remembers it on this browser only, for when the account already has it. */
export function markPostPrintDialogShownOnDevice(): void {
  shownThisPage = true;
  localStore.set(POST_PRINT_DIALOG_STORAGE_KEY, "1");
}

/** Best effort on both sides; a failed account write only costs cross-device memory. */
export async function markPostPrintDialogShown(uid: string | null = null): Promise<void> {
  markPostPrintDialogShownOnDevice();
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
    console.warn("RecipePrinter: could not record the feedback dialog on the account", error);
  }
}

export function resetPostPrintDialogForTest(): void {
  shownThisPage = false;
}
