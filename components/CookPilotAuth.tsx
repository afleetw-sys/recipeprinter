"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser,
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { friendlyAuthError } from "@/lib/friendlyErrors";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";

/* ──────────────────────────────────────────────────────────────────────────
   Shared CookPilot login: same Firebase project, same providers, same
   email-enumeration-safe provider check as CookPilotWeb's own auth. Used by
   both the CookPilot recipe importer and the print page's "Already
   purchased?" template-purchase recovery flow — one implementation so the
   two surfaces can't drift apart.
   ────────────────────────────────────────────────────────────────────────── */

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

const COOKPILOT_SIGNED_IN_STORAGE_KEY = "recipeprinter:cookpilot-was-signed-in:v1";

// `checkEmailProviders` briefly signs in anonymously just to authorize its
// `checkUserProviders` call, then deletes that session itself once done (see
// below). This flag stops the auth listener's purge from racing that in-flight
// call and deleting the session out from under it before the callable resolves.
let checkingEmailProviders = false;

export async function purgeAnonymousUser(user: User) {
  await deleteUser(user).catch(() => signOut(getFirebaseAuth()).catch(() => {}));
}

function readCookPilotWasSignedIn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(COOKPILOT_SIGNED_IN_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

function rememberCookPilotSignedIn(signedIn: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (signedIn) {
      window.localStorage.setItem(COOKPILOT_SIGNED_IN_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(COOKPILOT_SIGNED_IN_STORAGE_KEY);
    }
  } catch {
    /* localStorage can be unavailable; Firebase auth remains the source of truth. */
  }
}

export function useCookPilotAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !readCookPilotWasSignedIn());
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    // Google/Apple sign-in uses a full-page redirect (see handleGoogle/handleApple
    // below) rather than a popup, since popups are unreliable on mobile browsers
    // and in-app browsers — they silently open a new tab that never hands control
    // back to the opener. This resolves that redirect once the user lands back here.
    getRedirectResult(getFirebaseAuth()).catch((err) => {
      setRedirectError(friendlyAuthError(err, "We couldn't finish signing you in. Please try again."));
    });
  }, []);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      // RecipePrinter has no use for anonymous accounts, and they don't count
      // as being logged in to a CookPilot recipe library. `checkEmailProviders`
      // creates one briefly to authorize a callable and cleans it up itself;
      // skip purging here while that's in flight so we don't race it. Anything
      // else anonymous restored from a stale session gets purged on sight
      // instead of just hidden, so it doesn't linger as an orphaned user.
      if (nextUser?.isAnonymous) {
        if (!checkingEmailProviders) {
          purgeAnonymousUser(nextUser);
        }
        rememberCookPilotSignedIn(false);
        setUser(null);
        setReady(true);
        return;
      }
      rememberCookPilotSignedIn(Boolean(nextUser));
      setUser(nextUser ?? null);
      setReady(true);
    });
  }, []);

  return { user, ready, redirectError };
}

/** Which sign-in providers an email is already registered with, from CookPilot's own
 * `checkUserProviders` callable (Firebase Auth's provider list isn't usable here since
 * the project has email-enumeration protection on). Mirrors the iOS app's
 * `AuthFlowLogic.stepAfterEmailSubmit`. */
export async function checkEmailProviders(email: string): Promise<string[]> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  checkingEmailProviders = true;
  try {
    if (!auth.currentUser) {
      // checkUserProviders just requires *some* signed-in uid; an anonymous
      // session is enough, same as CookPilot's ensureAnonymousUserIfNeeded.
      // Scoped to this login flow only, not the shared parser call path.
      await signInAnonymously(auth);
    }
    const { getFns } = await import("@/lib/firebase/functions");
    const checkUserProviders = httpsCallable<{ email: string }, { providers: string[] | null }>(
      getFns(),
      "checkUserProviders",
    );
    const { data } = await checkUserProviders({ email });
    return data.providers ?? [];
  } finally {
    checkingEmailProviders = false;
    // This anonymous session exists only to authorize the call above; purge it
    // now rather than leaving it as an orphaned user in Firebase Auth.
    if (auth.currentUser?.isAnonymous) {
      await purgeAnonymousUser(auth.currentUser);
    }
  }
}

export function CookPilotLoginDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleEmailContinue(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email for your CookPilot account.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const providers = await checkEmailProviders(normalizedEmail);

      if (
        providers.includes(GoogleAuthProvider.PROVIDER_ID) &&
        !providers.includes(EmailAuthProvider.PROVIDER_ID)
      ) {
        // This account only has Google sign-in set up, so a password will
        // never work for it. Send them straight into the Google flow, the
        // same redirect the iOS app does for this case.
        await signInWithRedirect(getFirebaseAuth(), googleProvider);
        return;
      }

      if (
        providers.includes("apple.com") &&
        !providers.includes(GoogleAuthProvider.PROVIDER_ID) &&
        !providers.includes(EmailAuthProvider.PROVIDER_ID)
      ) {
        setNotice("This account uses Sign in with Apple. Close this and tap Continue with Apple instead.");
        return;
      }

      setStep("password");
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't verify that email. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!password) {
      setError("Enter the password for your CookPilot account.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim().toLowerCase(), password);
      onClose();
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithRedirect(getFirebaseAuth(), googleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
      setBusy(false);
    }
  }

  async function handleApple() {
    setBusy(true);
    setError(null);
    try {
      await signInWithRedirect(getFirebaseAuth(), appleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Apple. Please try again."));
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/30 p-0 sm:px-cp-4 sm:py-cp-6"
      role="dialog"
      aria-modal="true"
      aria-label="Log in to CookPilot"
    >
      <div className="panel panel--modal w-full sm:max-w-[420px] h-full sm:h-auto rounded-none border-0 sm:rounded-2xl sm:border p-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto">
        <button
          type="button"
          className="absolute right-3 top-3 icon-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={ICON_SIZE.md} />
        </button>

        <div className="pr-cp-7">
          <h3 className="font-extrabold tracking-[-0.02em] text-cp-h2">
            Log in to CookPilot
          </h3>
          <p className="text-cp-small text-ink-soft mt-1">
            Use an existing account to continue.
          </p>
        </div>

        {step === "email" ? (
          <form className="flex flex-col gap-cp-3" onSubmit={handleEmailContinue}>
            <div>
              <label className="field-label" htmlFor="cookpilot-email">
                Email
              </label>
              <input
                id="cookpilot-email"
                name="username"
                className="field"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Continue
            </button>
            <div className="flex items-center gap-cp-3 text-cp-caption text-ink-soft">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <button type="button" className="btn btn-secondary w-full" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </button>
            <button type="button" className="btn btn-secondary w-full" onClick={handleApple} disabled={busy}>
              Continue with Apple
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-cp-3" onSubmit={handlePasswordSubmit}>
            <input
              className="sr-only"
              type="email"
              name="username"
              autoComplete="username"
              value={email.trim().toLowerCase()}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
            />
            <div>
              <label className="field-label" htmlFor="cookpilot-password">
                Password for {email.trim()}
              </label>
              <input
                id="cookpilot-password"
                name="password"
                className="field"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Sign in
            </button>
            <button
              type="button"
              className="btn-ghost btn-compact w-full"
              onClick={() => {
                setStep("email");
                setPassword("");
                setError(null);
              }}
              disabled={busy}
            >
              Use a different email
            </button>
          </form>
        )}

        {notice && (
          <div className="state" role="status">
            <p>{notice}</p>
          </div>
        )}

        {error && (
          <div className="state state--error" role="alert">
            <h4>Couldn't sign in</h4>
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
