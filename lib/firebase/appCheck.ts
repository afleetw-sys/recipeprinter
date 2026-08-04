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

let appCheckInstance: AppCheck | null = null;

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
  if (appCheckInstance) return appCheckInstance;

  if (siteKey) {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return appCheckInstance;
  }

  // Debug/dev mode: Firebase swaps in its debug attestation when the global
  // token above is set, so the placeholder provider is never actually asked.
  appCheckInstance = initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () =>
        Promise.resolve({
          token: "debug-placeholder",
          expireTimeMillis: Date.now() + 3_600_000,
        }),
    }),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}
