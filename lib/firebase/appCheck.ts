import { CustomProvider, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";

// Mirrors CookPilot's App Check setup so RecipePrinter's requests pass the same
// App Check gate. Dev uses a registered debug token; production uses a reCAPTCHA
// v3 site key.
//
// Scope note: App Check only attests requests the Firebase SDK makes. A photo
// shown with `<img src={downloadURL}>` is a plain browser GET that never touches
// the SDK, so it can't carry a token and always counts as an unverified Storage
// read — that's inherent to download URLs, not something this init can change.
const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN ?? "";

if (typeof window !== "undefined") {
  if (debugToken) {
    // @ts-expect-error – Firebase App Check debug token global
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (!siteKey) {
    // @ts-expect-error – ask Firebase to print a fresh debug token
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

/**
 * The instance lives on `globalThis`, not in a module-scoped `let`.
 *
 * `getFirebaseApp` reuses the app across module re-evaluation because Firebase
 * keeps its own registry (`getApps()`), but a module-scoped guard does NOT
 * survive one — so on every hot reload this file came back with a fresh `null`,
 * called `initializeAppCheck` again, and handed reCAPTCHA a container it had
 * already rendered into: "reCAPTCHA has already been rendered in this element",
 * thrown from inside the SDK where nothing of ours could catch it.
 *
 * The app outlives the module, so the thing guarding it has to as well.
 */
const APP_CHECK_KEY = "__recipeprinterAppCheck";
type AppCheckHost = typeof globalThis & { [APP_CHECK_KEY]?: AppCheck };

// Idempotent and browser-only. Called from `getFirebaseApp()` the instant the
// Firebase app is created — before Auth/Firestore/Storage/Functions is ever
// obtained — so the attestation token starts fetching as early as possible and
// the first request out (often an Auth session restore on load) is already
// verified rather than slipping out unattested. Previously only db/storage/
// functions triggered App Check via a side-effect import, so an app whose first
// Firebase touch was Auth sent that request before App Check existed.
export function ensureAppCheck(app: FirebaseApp): AppCheck | null {
  // Server prerender never initializes App Check (no window).
  if (typeof window === "undefined") return null;

  const host = globalThis as AppCheckHost;
  const existing = host[APP_CHECK_KEY];
  if (existing) return existing;

  try {
    const instance = siteKey
      ? initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(siteKey),
          isTokenAutoRefreshEnabled: true,
        })
      : // Debug/dev mode: Firebase swaps in its debug attestation when the
        // global token above is set, so the placeholder provider is never
        // actually asked.
        initializeAppCheck(app, {
          provider: new CustomProvider({
            getToken: () =>
              Promise.resolve({
                token: "debug-placeholder",
                expireTimeMillis: Date.now() + 3_600_000,
              }),
          }),
          isTokenAutoRefreshEnabled: true,
        });
    host[APP_CHECK_KEY] = instance;
    return instance;
  } catch (error) {
    /**
     * A second initialization is not a failure worth taking the page down for.
     * Whatever raced us — a duplicate app, a stale widget the guard above could
     * not see — App Check is already running from that first call, and every
     * request the SDK makes is still attested. Requests are what this is for;
     * the exception is bookkeeping.
     */
    if (process.env.NODE_ENV !== "production") {
      console.warn("App Check was already initialized; reusing it.", error);
    }
    return null;
  }
}
