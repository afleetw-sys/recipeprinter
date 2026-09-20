"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  type AuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ensureRecipePrinterAccount } from "@/lib/firebase/recipePrinterAccount";
import { friendlyAuthError } from "@/lib/friendlyErrors";
import { createAccountOrRecover, isEmailInUseError } from "@/lib/signUpRecovery";
import {
  clearAuthRedirectPending,
  hasAuthRedirectPending,
  markAuthRedirectPending,
} from "@/lib/authRedirect";
import {
  purgeAnonymousUser as purgeAnonymousUserFor,
  settleAnonymousPurge,
  trackAnonymousPurge,
} from "@/lib/anonymousSession";
import { identifyUser } from "@/lib/analytics";
import {
  readCookPilotWasSignedIn,
  rememberCookPilotSignedIn,
} from "@/lib/cookPilotSession";
import { Dialog } from "@/components/Dialog";
import { AppleIcon, CheckIcon, GoogleIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";

/* ──────────────────────────────────────────────────────────────────────────
   Shared RecipePrinter login: same Firebase project, same providers, same
   email-enumeration-safe provider check as CookPilotWeb's own auth. Used by
   both the CookPilot recipe importer and the print page's "Already
   purchased?" template-purchase recovery flow — one implementation so the
   two surfaces can't drift apart.
   ────────────────────────────────────────────────────────────────────────── */

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");


// `checkEmailProviders` briefly signs in anonymously just to authorize its
// `checkUserProviders` call, then deletes that session itself once done (see
// below). This flag stops the auth listener's purge from racing that in-flight
// call and deleting the session out from under it before the callable resolves.
let checkingEmailProviders = false;

function shouldUseRedirectSignIn(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
}

export async function signInWithCookPilotProvider(provider: AuthProvider) {
  const auth = getFirebaseAuth();
  // The resolver is passed here, at the call that needs it, rather than to
  // `initializeAuth`: given there, the SDK loads its cross-origin iframe during
  // startup on mobile and Safari, for every visitor (see lib/authRedirect).
  if (shouldUseRedirectSignIn()) {
    // Marked BEFORE leaving, so the page that comes back knows there is a result
    // to read. If the redirect cannot even start, nothing is coming back.
    markAuthRedirectPending();
    try {
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
    } catch (error) {
      clearAuthRedirectPending();
      throw error;
    }
    return;
  }
  await signInWithPopup(auth, provider, browserPopupRedirectResolver);
}

export function purgeAnonymousUser(user: User): Promise<void> {
  return purgeAnonymousUserFor(getFirebaseAuth(), user);
}

let authReadyPromise: Promise<void> | null = null;

/** Starts IndexedDB session restoration before a CookPilot surface needs it. */
export function prewarmCookPilotAuth(): Promise<void> {
  if (!authReadyPromise) {
    authReadyPromise = getFirebaseAuth().authStateReady();
  }
  return authReadyPromise;
}

/* ── One auth state for the whole page ──────────────────────────────────────
   `useCookPilotAuth` mounts in several places at once (the print page, the
   account control in the header, the CookPilot picker), and each instance used
   to run its own `getRedirectResult` and its own `onAuthStateChanged`.

   The subscriptions were merely wasteful. `getRedirectResult` was not: it
   CONSUMES the pending redirect, so with two or three racing it, exactly one
   learns the outcome and the rest resolve empty. A Google/Apple sign-in that
   failed would report its error into whichever instance happened to win — and
   only the print page renders `redirectError`, so if the header's copy won, the
   user was returned from the provider and shown nothing at all.

   So the redirect is resolved once, into a shared promise, and every consumer
   reads the same answer. Same shape as `authReadyPromise` above. */

interface AuthState {
  user: User | null;
  ready: boolean;
  redirectError: string | null;
}

// `ready` also waits on a pending redirect: the page that comes back from Google or
// Apple has no stored user yet, and "no user" there means "still being read", not
// "signed out".
let authState: AuthState = {
  user: null,
  ready: !readCookPilotWasSignedIn() && !hasAuthRedirectPending(),
  redirectError: null,
};
const authSubscribers = new Set<(state: AuthState) => void>();
let unsubscribeAuth: (() => void) | null = null;
let redirectPromise: Promise<void> | null = null;

function publishAuthState(patch: Partial<AuthState>) {
  authState = { ...authState, ...patch };
  authSubscribers.forEach((notify) => notify(authState));
}

/** True from the moment a pending redirect starts being read until it has been. */
let redirectInFlight = false;

/**
 * How long "still being read" may hold auth back from reporting a signed-out
 * visitor. A read that is genuinely stuck (a blocked iframe, a dead connection)
 * must not leave the app waiting on a sign-in that is never going to be
 * announced; if it does arrive later, the listener still delivers the user.
 */
const REDIRECT_READ_TIMEOUT_MS = 10_000;

/**
 * Reads the Google/Apple redirect result, once per page load, and only when a
 * redirect actually left from this tab.
 *
 * Most loads are not the return leg of a redirect, and reading a result is what
 * loads the SDK's cross-origin iframe, so those loads skip it entirely (see
 * lib/authRedirect). When one IS pending, auth is not reported as ready with no
 * user until it has been read: without that the app would see a signed-out
 * visitor for as long as the read takes, and act on it.
 */
function resolveRedirectOnce(): void {
  if (redirectPromise) return;
  if (!hasAuthRedirectPending()) {
    redirectPromise = Promise.resolve();
    return;
  }
  redirectInFlight = true;
  const settle = () => {
    if (!redirectInFlight) return;
    redirectInFlight = false;
    clearAuthRedirectPending();
    // A successful read has already announced the user through the listener. If
    // there is none, the answer is now known to be "signed out", and the
    // listener held it back until this moment.
    const current = getFirebaseAuth().currentUser;
    if (!current || current.isAnonymous) publishAuthState({ user: null, ready: true });
  };
  const timer = window.setTimeout(settle, REDIRECT_READ_TIMEOUT_MS);
  redirectPromise = getRedirectResult(getFirebaseAuth(), browserPopupRedirectResolver)
    .then(() => undefined)
    .catch((err) => {
      publishAuthState({
        redirectError: friendlyAuthError(err, "We couldn't finish signing you in. Please try again."),
      });
    })
    .finally(() => {
      window.clearTimeout(timer);
      settle();
    });
}

/** Starts the single `onAuthStateChanged` subscription on first use. */
function startAuthSubscription(): void {
  if (unsubscribeAuth) return;
  unsubscribeAuth = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
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
      publishAuthState({ user: null, ready: true });
      return;
    }
    // A redirect result is still being read, so "no user" is "not yet".
    if (!nextUser && redirectInFlight) return;
    rememberCookPilotSignedIn(Boolean(nextUser));
    if (nextUser) {
      // The one place a real CookPilot account becomes known — identify the
      // PostHog person here so first-/latest-touch attribution lands on the
      // person. Uses the opaque Firebase uid, no PII.
      identifyUser(nextUser.uid);
      // Account metadata is best-effort and must never hold the sign-in UI
      // hostage. Rules allow only these harmless timestamps; server-owned
      // purchases, entitlements, grants, and roles cannot be changed here.
      void ensureRecipePrinterAccount(nextUser).catch((error) => {
        console.warn("Could not initialize RecipePrinter account metadata.", error);
      });
    }
    publishAuthState({ user: nextUser ?? null, ready: true });
  });
}

export function useCookPilotAuth() {
  const [state, setState] = useState<AuthState>(authState);

  useEffect(() => {
    resolveRedirectOnce();
    startAuthSubscription();
    authSubscribers.add(setState);
    // A state change between this component's render and this effect (another
    // instance mounted first and the listener already fired) would otherwise be
    // missed, since only future notifications reach a late subscriber.
    setState(authState);
    return () => {
      authSubscribers.delete(setState);
      // Deliberately NOT unsubscribing from Firebase when the last consumer
      // unmounts: these hooks mount and unmount as dialogs and panels come and
      // go, and tearing the listener down would drop `authState` back to its
      // pre-hydration default and re-run the redirect resolution on the next
      // mount. One listener per page load is the intent.
    };
  }, []);

  return state;
}

/**
 * Re-publishes the signed-in user after something mutated it in place.
 *
 * `updateProfile`/`updatePassword` (Firebase's modular SDK) write straight
 * onto the existing `User` object rather than handing back a new one, and
 * neither fires `onAuthStateChanged` — profile fields changing isn't a change
 * of identity. So `authState.user` above is already the updated object the
 * moment either call resolves, but nothing has told its subscribers to
 * re-render: same reference, so a plain `setState` upstream wouldn't even
 * see a difference. Call this right after such a mutation succeeds so every
 * `useCookPilotAuth()` consumer (the header avatar's initials, this page's
 * own identity block) picks up the new value immediately instead of waiting
 * for the next real auth event or a reload.
 */
export function refreshCookPilotAuthUser(): void {
  publishAuthState({ user: getFirebaseAuth().currentUser });
}

/** Which sign-in providers an email is already registered with, from CookPilot's own
 * `checkUserProviders` callable (Firebase Auth's provider list isn't usable here since
 * the project has email-enumeration protection on). Mirrors the iOS app's
 * `AuthFlowLogic.stepAfterEmailSubmit`. */
/**
 * Sends a password-reset email.
 *
 * There was no way to recover a password anywhere in either product — not here
 * and not in the CookPilot iOS app, whose `AuthClient` has no reset operation at
 * all. The two share one Firebase Auth project, so between them a forgotten
 * password locked you out permanently. For RecipePrinter that also means a lost
 * $19.99 cookbook, since entitlement hangs off the account.
 *
 * Two things worth knowing about the behaviour:
 *
 * The project has email-enumeration protection on (it is why
 * `checkEmailProviders` exists as a callable instead of reading Firebase's own
 * provider list). With it on, this resolves the same way whether or not an
 * account exists — so the UI must never say "we sent you a link", only that one
 * is on the way IF there is an account. Anything more specific would hand back
 * the enumeration oracle the protection removes.
 *
 * The `url` is where the reset lands afterwards, and it has to be an authorized
 * domain in the Firebase console. If it isn't, Firebase rejects the whole call
 * with `auth/unauthorized-continue-uri` — so a missing bit of console config
 * would take password recovery down entirely. Not worth that: on exactly that
 * error we retry with no continue URL, which falls back to Firebase's own
 * "password changed" page. Slightly less polished, still recovers the account.
 */
export async function sendCookPilotPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  const normalized = email.trim().toLowerCase();
  try {
    await sendPasswordResetEmail(auth, normalized, {
      url: `${window.location.origin}/`,
      handleCodeInApp: false,
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/unauthorized-continue-uri") {
      await sendPasswordResetEmail(auth, normalized);
      return;
    }
    throw error;
  }
}

export async function checkEmailProviders(email: string): Promise<string[]> {
  const auth = getFirebaseAuth();
  await prewarmCookPilotAuth();
  checkingEmailProviders = true;
  let temporaryUser: User | null = null;
  try {
    if (!auth.currentUser) {
      // checkUserProviders just requires *some* signed-in uid; an anonymous
      // session is enough, same as CookPilot's ensureAnonymousUserIfNeeded.
      // Scoped to this login flow only, not the shared parser call path.
      const credential = await signInAnonymously(auth);
      temporaryUser = credential.user;
    }
    // Both halves dynamic, together — the shape every other callable site uses
    // (lib/parser). `httpsCallable` was a
    // STATIC import, which pulled `firebase/functions` into this chunk anyway,
    // so the `await import` beside it bought nothing and the prewarm below was
    // overlapping a download that had already happened.
    const [{ httpsCallable }, { getFns }] = await Promise.all([
      import("firebase/functions"),
      import("@/lib/firebase/functions"),
    ]);
    const checkUserProviders = httpsCallable<{ email: string }, { providers: string[] | null }>(
      getFns(),
      "checkUserProviders",
    );
    const { data } = await checkUserProviders({ email });
    return data.providers ?? [];
  } finally {
    checkingEmailProviders = false;
    // This session has already done its job. Cleanup must not hold the UI on a
    // spinner before the password field appears.
    if (temporaryUser?.isAnonymous) {
      // Tracked, not just fired: whoever signs in next waits for it, because a
      // delete still running when they do signs them straight back out. See
      // lib/anonymousSession.
      trackAnonymousPurge(purgeAnonymousUser(temporaryUser));
    }
  }
}

/**
 * The interactive half of RecipePrinter's sign-in: the email/password/create
 * steps and the Google/Apple buttons, with no heading, no close button, and
 * no `Dialog` wrapper of its own.
 *
 * Split out of `CookPilotLoginDialog` so a caller that needs sign-in to
 * happen *inside* a modal it already owns — the Pro upgrade dialog
 * transitioning from plan choice to sign-in without opening a second popup —
 * can embed the exact same form, error handling, and provider logic rather
 * than duplicating any of it. `CookPilotLoginDialog` below is now a thin
 * `Dialog` + heading shell around this.
 */
export function CookPilotLoginForm({
  onAuthenticated,
  autoFocus = true,
  onBusyChange,
}: {
  onAuthenticated: () => void;
  /** Off when this form isn't the first interactive thing on screen — e.g.
      mounted mid-dialog, after a plan-choice step that already had focus. */
  autoFocus?: boolean;
  /** So a host that owns its own close button (e.g. `CookPilotLoginDialog`)
      can disable it while a request is in flight, without this form needing
      to know about dialogs at all. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [step, setStep] = useState<"email" | "password" | "create">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => {
    setBusyState(value);
    onBusyChange?.(value);
  };
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  // Signed in, and the host has been told. The form is finished: some hosts (the
  // Pro upgrade dialog) keep it mounted while they carry on with checkout, and a
  // form left showing its "Create account" button is one a person presses again.
  const [signedIn, setSignedIn] = useState(false);
  // Read synchronously, unlike `busy`, which only changes on the next render: two
  // submits in the same tick (a doubled Enter, a double tap) would both see
  // `busy` false and both go through.
  const submittingRef = useRef(false);

  useEffect(() => {
    // Overlap the Functions chunk download with the time spent entering an
    // email instead of starting it after Continue is pressed.
    void import("@/lib/firebase/functions");
    void prewarmCookPilotAuth();
  }, []);

  async function handleEmailContinue(event: FormEvent) {
    event.preventDefault();
    if (busy || signedIn || submittingRef.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address.");
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
        await settleAnonymousPurge();
        await signInWithCookPilotProvider(googleProvider);
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

      setStep(providers.length === 0 ? "create" : "password");
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't verify that email. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || signedIn || submittingRef.current) return;
    if (!password) {
      setError("Enter your password.");
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    // The anonymous session the email check borrowed may still be being deleted.
    // Signing in before that finishes lets the delete sign the new account out.
    await settleAnonymousPurge();
    const auth = getFirebaseAuth();
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const signIn = () => signInWithEmailAndPassword(auth, normalizedEmail, password);
      if (step === "create") {
        await createAccountOrRecover(
          {
            create: () => createUserWithEmailAndPassword(auth, normalizedEmail, password),
            signIn,
            currentUserEmail: () => (auth.currentUser?.isAnonymous ? null : auth.currentUser?.email),
          },
          normalizedEmail,
        );
      } else {
        await signIn();
      }
      setSignedIn(true);
      onAuthenticated();
    } catch (err) {
      if (step === "create" && isEmailInUseError(err)) {
        // A real existing account, and not one this password opens. Move to the
        // step that fits, so the way forward (sign in, or reset the password) is
        // right there instead of in a message telling them to go and find it.
        setStep("password");
        setPassword("");
        setError("That email already has an account. Enter its password to sign in.");
        return;
      }
      setError(
        friendlyAuthError(
          err,
          step === "create"
            ? "We couldn't create your account. Please try again."
            : "We couldn't sign in. Please try again.",
        ),
      );
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  /**
   * Offered only on the `password` step, which is reached only when
   * `checkEmailProviders` has already said this email HAS a password account —
   * so it never has to guess, and never asks someone with a Google-only account
   * to reset a password they don't have.
   */
  async function handleForgotPassword() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendCookPilotPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't send the reset email. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithCookPilotProvider(googleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
      setBusy(false);
    }
  }

  async function handleApple() {
    setBusy(true);
    setError(null);
    try {
      await signInWithCookPilotProvider(appleProvider);
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Apple. Please try again."));
      setBusy(false);
    }
  }

  return (
    <>
        {signedIn ? (
          <div className="state flex items-center gap-cp-2" role="status">
            <CheckIcon size={ICON_SIZE.md} />
            <p>You&apos;re signed in.</p>
          </div>
        ) : step === "email" ? (
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
                autoFocus={autoFocus}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError(null);
                }}
              />
              {error && <p className="field-error" role="alert">{error}</p>}
              <p className="mt-1 text-cp-caption leading-4 text-ink-soft">
                Already use CookPilot? Sign in with the same account.
              </p>
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
            <div className="grid grid-cols-2 gap-cp-2">
              <button type="button" className="btn btn-secondary w-full" onClick={handleGoogle} disabled={busy}>
                <GoogleIcon size={ICON_SIZE.md} />
                Google
              </button>
              <button type="button" className="btn btn-secondary w-full" onClick={handleApple} disabled={busy}>
                <AppleIcon size={ICON_SIZE.md} />
                Apple
              </button>
            </div>
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
                {step === "create" ? "Create a password for" : "Password for"} {email.trim()}
              </label>
              <input
                id="cookpilot-password"
                name="password"
                className="field"
                type="password"
                autoComplete={step === "create" ? "new-password" : "current-password"}
                autoFocus={autoFocus}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError(null);
                }}
              />
              {error && <p className="field-error" role="alert">{error}</p>}
              {step === "password" && (
                <div className="mt-2">
                  {resetSent ? (
                    /* Deliberately conditional — "if there's an account". The
                       project has email-enumeration protection on, and a flat
                       "we sent it" would confirm the address exists, which is
                       the exact thing that protection removes. */
                    <p className="text-cp-caption text-ink-soft" role="status">
                      If there’s an account for {email.trim()}, a reset link is on its way. It can
                      take a minute, and it might land in spam.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="text-cp-caption text-ink-soft underline underline-offset-2 bg-transparent border-0 p-0"
                      onClick={handleForgotPassword}
                      disabled={busy}
                    >
                      Forgot your password?
                    </button>
                  )}
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              {step === "create" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn-ghost btn-compact w-full"
              onClick={() => {
                setStep("email");
                setPassword("");
                setError(null);
                setResetSent(false);
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
    </>
  );
}

export function CookPilotLoginDialog({
  onClose,
  onAuthenticated,
  reason = "default",
  footer,
}: {
  onClose: () => void;
  onAuthenticated?: () => void;
  reason?: "default" | "purchase";
  /**
   * Something the surface that opened this needs to say underneath it, usually
   * a way on for someone who is not going to sign in.
   *
   * A node rather than another `reason`, because what belongs here is known
   * only to the caller: the account menu puts a link to a cookbook this device
   * already holds, which this module has no business knowing about. Shared
   * auth stays shared.
   */
  footer?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      onClose={onClose}
      closeDisabled={busy}
      label={reason === "purchase" ? "Save your recipes and purchases" : "Create an account or sign in"}
      portal
      className="fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[420px] max-h-[88dvh] sm:max-h-none sm:h-auto rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto"
    >
      <button
        type="button"
        className="absolute right-3 top-3 icon-close-btn"
        onClick={onClose}
        aria-label="Close"
        disabled={busy}
      >
        <XIcon size={ICON_SIZE.md} />
      </button>

      <div className="pr-cp-7">
        <h3 className="font-extrabold tracking-[-0.02em] text-cp-dialog-title">
          {reason === "purchase" ? "Save your recipes and purchases" : "Create an account or sign in"}
        </h3>
        <p className="text-cp-small text-ink-soft mt-1">
          {reason === "purchase"
            ? "Signing in keeps your recipes, purchases, and Pro access with your account, so they're all here when you come back on this device or any other."
            : "An account keeps these projects saved on every device you use."}
        </p>
      </div>

      <CookPilotLoginForm onAuthenticated={onAuthenticated ?? onClose} onBusyChange={setBusy} />

      {footer && <div className="border-t border-line pt-cp-3">{footer}</div>}
    </Dialog>
  );
}
