import { signOut, type Auth } from "firebase/auth";
import { localStore } from "@/lib/storage";

/**
 * Why a signed-in session ended: the person pressed Sign out, or Firebase
 * dropped it on its own (it does that when the server calls the session
 * revoked or the account disabled).
 *
 * Kept in storage, not memory, because Firebase signs every tab out together:
 * a Sign out pressed in one tab must not read as Firebase's doing in the
 * others.
 */
const SIGN_OUT_PRESSED_KEY = "recipeprinter:sign-out-pressed-at:v1";
/** Long enough for every open tab to hear about it. */
const PRESSED_WINDOW_MS = 30_000;

/** Every Sign out button goes through this, so its sign-out is never counted
 *  as one Firebase did on its own. */
export function signOutOnPurpose(auth: Auth): Promise<void> {
  localStore.set(SIGN_OUT_PRESSED_KEY, String(Date.now()));
  return signOut(auth);
}

export function sessionEndCause(now = Date.now()): "sign_out" | "firebase" {
  const pressedAt = Number(localStore.get(SIGN_OUT_PRESSED_KEY));
  return Number.isFinite(pressedAt) && pressedAt > 0 && now - pressedAt < PRESSED_WINDOW_MS
    ? "sign_out"
    : "firebase";
}
