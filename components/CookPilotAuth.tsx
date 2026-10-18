"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  type AuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ensureRecipePrinterAccount } from "@/lib/firebase/recipePrinterAccount";
import { authFailureCode, friendlyAuthError } from "@/lib/friendlyErrors";
import { CODE_LIFETIME_MS } from "@/lib/emailCodePending";
import {
  forgetPendingCode,
  normalizeEmail,
  readPendingCode,
  rememberPendingCode,
  sendEmailCode,
  verifyEmailCode,
} from "@/lib/emailCode";
import { isPopupDismissal, watchForPopupReturn } from "@/lib/authPopup";
import {
  clearAuthRedirectPending,
  hasAuthRedirectPending,
  markAuthRedirectPending,
} from "@/lib/authRedirect";
import { purgeAnonymousUser as purgeAnonymousUserFor } from "@/lib/anonymousSession";
import { syncAnalyticsIdentity, track } from "@/lib/analytics";
import {
  readCookPilotWasSignedIn,
  rememberCookPilotSignedIn,
} from "@/lib/cookPilotSession";
import { Dialog } from "@/components/Dialog";
import { AppleIcon, CheckIcon, ChevronLeftIcon, EyeIcon, EyeOffIcon, GoogleIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";

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


function providerMethod(providerId: string | null | undefined): "google" | "apple" {
  return providerId === "apple.com" ? "apple" : "google";
}

/** Safari has no requestIdleCallback, so a short timer stands in for it. The
    timeout on the real one stops a permanently busy page postponing this for ever. */
function runWhenIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 5_000 });
  } else {
    window.setTimeout(run, 2_000);
  }
}

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

/**
 * Google or Apple, by whichever route this device takes. The one place the
 * attempt, the outcome and the failure code are recorded for every way in (the
 * form's buttons, its Google-only hand-off from the email step, and the account
 * menu's own buttons), so they cannot drift apart.
 *
 * A redirect leaves the page, so it has no outcome here: what it returns is
 * recorded by `resolveRedirectOnce` on the page that comes back.
 *
 * `handBack` gives the surface its controls back when someone closes the
 * provider's window.
 */
export async function signInWithTrackedProvider(
  provider: AuthProvider,
  method: "google" | "apple",
  handBack: () => void,
) {
  const via = shouldUseRedirectSignIn() ? "redirect" : "popup";
  track("auth_attempted", { method, via });
  // Firebase only learns a popup was closed by polling, then waits eight more
  // seconds before rejecting, so awaiting it alone leaves the surface disabled
  // for up to ten seconds after someone closes Google's window. Hand it back
  // as soon as focus returns to this page instead (see lib/authPopup).
  const stopWatching = via === "popup" ? watchForPopupReturn(handBack) : undefined;
  try {
    await signInWithCookPilotProvider(provider);
    if (via === "popup") track("auth_succeeded", { method });
  } catch (err) {
    track("auth_failed", { method, code: authFailureCode(err) });
    // Closing the window is a choice, not a failure: the surface is simply back.
    // It arrives after the controls have already been handed back, or, where the
    // browser never reports focus returning, is what hands them back.
    if (isPopupDismissal(err)) {
      handBack();
      return;
    }
    throw err;
  } finally {
    stopWatching?.();
  }
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
    .then((result) => {
      // A redirect left this tab and came back. `no_result` (nobody signed in, no
      // error) is what browsers that block third-party storage do to it, so this
      // is the measure of whether redirect sign-in works, per browser.
      track("auth_redirect_returned", { outcome: result ? "signed_in" : "no_result" });
      if (result) track("auth_succeeded", { method: providerMethod(result.providerId) });
    })
    .catch((err) => {
      track("auth_redirect_returned", { outcome: "error", code: authFailureCode(err) });
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
    // as being logged in to a CookPilot recipe library. It no longer creates any
    // (the email check is attested by App Check instead), but older builds did,
    // and one can still be restored from a stale session. Purged on sight rather
    // than just hidden, so it doesn't linger as an orphaned user.
    if (nextUser?.isAnonymous) {
      purgeAnonymousUser(nextUser);
      rememberCookPilotSignedIn(false);
      publishAuthState({ user: null, ready: true });
      return;
    }
    // A redirect result is still being read, so "no user" is "not yet".
    if (!nextUser && redirectInFlight) return;
    rememberCookPilotSignedIn(Boolean(nextUser));
    // The one place a real CookPilot account becomes known, or stops being:
    // identify the PostHog person (opaque Firebase uid, no PII), and end it on
    // sign-out so the next person on a shared device isn't recorded as them.
    syncAnalyticsIdentity(nextUser?.uid ?? null);
    if (nextUser) {
      // Account metadata is best-effort and must never hold the sign-in UI
      // hostage. Rules allow only these harmless timestamps; server-owned
      // purchases, entitlements, grants, and roles cannot be changed here.
      //
      // And it need not compete with the page loading either: it pulls in the
      // Firestore SDK (about 127 KB gzipped) for a timestamp, and nothing depends
      // on the shell existing yet (no security rule reads it, and its readers,
      // /print and /account, load Firestore themselves). So it waits for the
      // browser to be idle. It is already skipped outright for 12 hours after a
      // successful write (see lib/firebase/recipePrinterAccount).
      runWhenIdle(() => {
        void ensureRecipePrinterAccount(nextUser).catch((error) => {
          console.warn("Could not initialize RecipePrinter account metadata.", error);
        });
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
 * The project has email-enumeration protection on (it is why the email step
 * asks a callable instead of reading Firebase's own provider list). With it on, this resolves the same way whether or not an
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


/** "Send a new code" waits this long after a send, as the server does. */
const RESEND_WAIT_MS = 30_000;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * The 6-digit code field and what goes with it: checking the code, signing in
 * with the token it earns, and sending a new one. Shared by the sign-in form and
 * the referral's "Your Pro is waiting" step, so the two can't drift apart.
 */
function EmailCodeEntry({
  email,
  sentAtMs,
  autoFocus,
  busy,
  setBusy,
  onSent,
  onSignedIn,
  back,
  children,
}: {
  email: string;
  sentAtMs: number;
  autoFocus: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** A new code went out. */
  onSent: (hasPassword: boolean) => void;
  onSignedIn: (created: boolean) => void;
  /** A way back, above the field (right under the dialog's subtitle). */
  back?: ReactNode;
  /** Extra ways out, under the button. */
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const submittingRef = useRef(false);
  const now = useNow(true);
  const waitSec = Math.max(0, Math.ceil((sentAtMs + RESEND_WAIT_MS - now) / 1000));

  async function submit(value: string) {
    if (submittingRef.current) return;
    if (!/^\d{6}$/.test(value)) {
      setError("Enter the 6 digits from the email.");
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    track("auth_attempted", { method: "email_code" });
    try {
      const result = await verifyEmailCode(email, value);
      if (result.status === "ok") {
        await signInWithCustomToken(getFirebaseAuth(), result.token);
        forgetPendingCode();
        track("auth_succeeded", { method: "email_code", created: result.created });
        onSignedIn(result.created);
        return;
      }
      track("auth_failed", { method: "email_code", code: `code/${result.status}` });
      setCode("");
      setError(
        result.status === "wrong"
          ? `That code didn't match. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`
          : "That code has expired. Send a new one to keep going.",
      );
    } catch (err) {
      track("auth_failed", { method: "email_code", code: authFailureCode(err) });
      setError(friendlyAuthError(err, "We couldn't sign you in. Please try again."));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || waitSec > 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendEmailCode(email);
      if (result.status === "sent") {
        setCode("");
        setResent(true);
        onSent(result.hasPassword);
      } else if (result.status === "rate_limited") {
        setError("We've sent a few codes already. Try again in a few minutes.");
      }
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't send a new code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-cp-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(code);
      }}
    >
      {back}
      <div>
        <label className="field-label" htmlFor="cookpilot-code">
          Enter the 6-digit code we sent to {email}
        </label>
        <input
          id="cookpilot-code"
          name="one-time-code"
          className="field text-center tracking-[0.3em] text-cp-body-lg"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus={autoFocus}
          value={code}
          disabled={busy}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
            // A refusal stays until the digits change: a change event that
            // leaves them as they were (autofill, a password manager) isn't
            // the cook trying again.
            if (error && digits !== code && digits.length > 0) setError(null);
            setCode(digits);
            // A pasted or autofilled code goes straight in.
            if (digits.length === 6) void submit(digits);
          }}
        />
        {error ? (
          <p className="field-error" role="alert">{error}</p>
        ) : (
          <p className="mt-1 text-cp-caption leading-4 text-ink-soft" role="status">
            {resent ? "A new code is on its way. " : ""}It can take a minute to arrive. Check your spam folder if
            it&rsquo;s not there.
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
        Continue
      </button>
      <button
        type="button"
        className="btn-ghost btn-compact w-full"
        onClick={() => void resend()}
        disabled={busy || waitSec > 0}
      >
        {waitSec > 0 ? `Send a new code in ${waitSec}s` : "Send a new code"}
      </button>
      {children}
    </form>
  );
}

/**
 * The interactive half of RecipePrinter's sign-in: the email, code and password
 * steps and the Google/Apple buttons, with no heading, no close button, and no
 * `Dialog` wrapper of its own.
 *
 * An email address signs in with a 6-digit code (lib/emailCode): it makes the
 * account if there isn't one, verified from the start, so nobody new ever picks
 * a password. An account that already has a password can still use it ("Use my
 * password instead"). Google- and Apple-only addresses go to their provider, as
 * before.
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
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [sentAtMs, setSentAtMs] = useState(0);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  // form left showing its "Continue" button is one a person presses again.
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
    // Back from Mail (a reload, or a tab the phone dropped) to the code step.
    const pending = readPendingCode();
    if (pending && !getFirebaseAuth().currentUser) {
      setEmail(pending.email);
      setHasPassword(pending.hasPassword);
      setSentAtMs(pending.sentAtMs);
      setStep("code");
    }
  }, []);

  const signInWithProvider = (provider: AuthProvider, method: "google" | "apple") =>
    signInWithTrackedProvider(provider, method, () => setBusy(false));

  function codeSent(to: string, withPassword: boolean) {
    const at = Date.now();
    rememberPendingCode({ email: to, hasPassword: withPassword, sentAtMs: at });
    setHasPassword(withPassword);
    setSentAtMs(at);
    setStep("code");
  }

  function finish() {
    setSignedIn(true);
    onAuthenticated();
  }

  async function handleEmailContinue(event: FormEvent) {
    event.preventDefault();
    if (busy || signedIn || submittingRef.current) return;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendEmailCode(normalizedEmail);

      if (result.status === "use_provider" && result.provider === "google") {
        track("auth_email_checked", { outcome: "google_only" });
        // This account only has Google sign-in set up, so send them straight
        // into the Google flow, the same redirect the iOS app does for this case.
        try {
          await signInWithProvider(googleProvider, "google");
        } catch (err) {
          setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
        }
        return;
      }
      if (result.status === "use_provider") {
        track("auth_email_checked", { outcome: "apple_only" });
        setNotice("This account uses Sign in with Apple. Close this and tap Continue with Apple instead.");
        return;
      }
      if (result.status === "rate_limited") {
        track("auth_email_checked", { outcome: "rate_limited" });
        setError("We've sent a few codes already. Try again in a few minutes.");
        return;
      }

      track("auth_email_checked", { outcome: result.hasPassword ? "password" : "code" });
      codeSent(normalizedEmail, result.hasPassword);
    } catch (err) {
      track("auth_email_checked", { outcome: "error", errorCode: authFailureCode(err) });
      setError(friendlyAuthError(err, "We couldn't send a code to that email. Please try again."));
    } finally {
      submittingRef.current = false;
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
    const method = "email_signin";
    track("auth_attempted", { method });
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), normalizeEmail(email), password);
      forgetPendingCode();
      track("auth_succeeded", { method });
      finish();
    } catch (err) {
      track("auth_failed", { method, code: authFailureCode(err) });
      setError(friendlyAuthError(err, "We couldn't sign in. Please try again."));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  /**
   * From the password step back to a code. The code already emailed still
   * works for 10 minutes, so it's only sent again after that: a new code
   * replaces the old one, and the cook may already be reading the first email.
   */
  async function handleUseCode() {
    if (busy) return;
    if (sentAtMs > 0 && Date.now() - sentAtMs < CODE_LIFETIME_MS) {
      setError(null);
      setStep("code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await sendEmailCode(email);
      if (result.status === "sent") codeSent(normalizeEmail(email), result.hasPassword);
      else if (result.status === "rate_limited") setError("We've sent a few codes already. Try again in a few minutes.");
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't send a code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Offered only on the `password` step, which is reached only when the server
   * has said this email HAS a password, so it never asks someone without one
   * to reset it.
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
      await signInWithProvider(googleProvider, "google");
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Google. Please try again."));
      setBusy(false);
    }
  }

  async function handleApple() {
    setBusy(true);
    setError(null);
    try {
      await signInWithProvider(appleProvider, "apple");
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign in with Apple. Please try again."));
      setBusy(false);
    }
  }

  function differentEmail() {
    forgetPendingCode();
    setStep("email");
    setPassword("");
    setError(null);
    setResetSent(false);
  }

  // A back button, first thing under the dialog's subtitle on the code and
  // password steps.
  const differentEmailButton = (
    <button
      type="button"
      className="self-start -ml-1 inline-flex items-center gap-1 bg-transparent border-0 p-0 text-cp-small text-ink-soft hover:text-ink"
      onClick={differentEmail}
      disabled={busy}
    >
      <ChevronLeftIcon size={ICON_SIZE.md} />
      Use a different email
    </button>
  );

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
        ) : step === "code" ? (
          <EmailCodeEntry
            email={normalizeEmail(email)}
            sentAtMs={sentAtMs}
            autoFocus={autoFocus}
            busy={busy}
            setBusy={setBusy}
            onSent={(withPassword) => codeSent(normalizeEmail(email), withPassword)}
            onSignedIn={finish}
            back={differentEmailButton}
          >
            {hasPassword && (
              <button
                type="button"
                className="btn-ghost btn-compact w-full"
                onClick={() => {
                  setError(null);
                  setStep("password");
                }}
                disabled={busy}
              >
                Use my password instead
              </button>
            )}
          </EmailCodeEntry>
        ) : (
          <form className="flex flex-col gap-cp-3" onSubmit={handlePasswordSubmit}>
            {differentEmailButton}
            <input
              className="sr-only"
              type="email"
              name="username"
              autoComplete="username"
              value={normalizeEmail(email)}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
            />
            <div>
              <label className="field-label" htmlFor="cookpilot-password">
                Password for {email.trim()}
              </label>
              <div className="relative">
                <input
                  id="cookpilot-password"
                  name="password"
                  className="field pr-12"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus={autoFocus}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                  }}
                />
                {/* Show or hide what's typed. Keeps the caret in the field (no
                    focus change on press), so typing carries on either way. */}
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded text-ink-soft hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="cookpilot-password"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOffIcon size={ICON_SIZE.lg} /> : <EyeIcon size={ICON_SIZE.lg} />}
                </button>
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
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
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Sign in
            </button>
            <button type="button" className="btn-ghost btn-compact w-full" onClick={() => void handleUseCode()} disabled={busy}>
              Email me a code instead
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
  intro,
  footer,
}: {
  onClose: () => void;
  /** For `verify_referral`, called once the code has confirmed the address. */
  onAuthenticated?: () => void;
  /** `verify_referral`: already signed in (an older password account whose
      address was never confirmed), with a friend's Pro waiting on it. Shows
      that one line and a code field, no form. */
  reason?: "default" | "purchase" | "verify_referral";
  /**
   * The heading and line above the form, when the surface that opened this
   * knows why: the account menu's Projects, Invites and Settings rows each say
   * what signing in gets you there. Same reasoning as `footer`.
   */
  intro?: { title: string; body: string };
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
  if (reason === "verify_referral") return <VerifyReferralEmail onClose={onClose} onVerified={onAuthenticated ?? onClose} />;
  const title =
    intro?.title ?? (reason === "purchase" ? "Save your cookbook and purchase" : "Create an account or sign in");
  return (
    <Dialog
      onClose={onClose}
      closeDisabled={busy}
      label={title}
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
          {title}
        </h3>
        <p className="text-cp-small text-ink-soft mt-1">
          {intro
            ? intro.body
            : reason === "purchase"
            ? "Signing in keeps this cookbook and its purchase with your account, so you can come back to it on this device or another one."
            : "Keep your recipe cards, cookbooks and purchases in one place, and pick up where you left off on any device."}
        </p>
      </div>

      <CookPilotLoginForm onAuthenticated={onAuthenticated ?? onClose} onBusyChange={setBusy} />

      {footer && <div className="border-t border-line pt-cp-3">{footer}</div>}
    </Dialog>
  );
}

/**
 * A friend's Pro is waiting on an address this account never confirmed: an
 * older password account (code accounts are confirmed from the start). A code
 * confirms it. Links emailed before codes existed still work too, through
 * ReferralHost's focus check.
 */
function VerifyReferralEmail({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const email = getFirebaseAuth().currentUser?.email ?? "";
  const [sentAtMs, setSentAtMs] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current || !email) return;
    sentRef.current = true;
    sendEmailCode(email)
      .then((result) => {
        if (result.status === "sent") setSentAtMs(Date.now());
        // Rate limited: a code went out moments ago, and that one still works.
        else if (result.status === "rate_limited") setSentAtMs(Date.now());
      })
      .catch((err) => setFailed(friendlyAuthError(err, "We couldn't send the code. Please try again.")));
  }, [email]);

  return (
    <Dialog
      onClose={onClose}
      closeDisabled={busy}
      label="Your Pro is waiting"
      portal
      className="no-print fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[420px] rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-cp-5 flex flex-col gap-cp-4 relative"
    >
      <button type="button" className="absolute right-3 top-3 icon-close-btn" onClick={onClose} aria-label="Close" disabled={busy}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      <div className="pr-cp-7">
        <h3 className="font-extrabold tracking-[-0.02em] text-cp-dialog-title">Your Pro is waiting</h3>
        <p className="text-cp-small text-ink-soft mt-1">
          Confirm your email and your free days of Pro start right away.
        </p>
      </div>
      {failed ? (
        <p className="text-cp-small text-ink-soft" role="status">{failed}</p>
      ) : sentAtMs > 0 ? (
        <EmailCodeEntry
          email={email}
          sentAtMs={sentAtMs}
          autoFocus
          busy={busy}
          setBusy={setBusy}
          onSent={() => setSentAtMs(Date.now())}
          onSignedIn={onVerified}
        />
      ) : (
        <div className="flex justify-center py-cp-2" role="status" aria-label="Sending the code">
          <SpinnerIcon size={ICON_SIZE.md} />
        </div>
      )}
    </Dialog>
  );
}
