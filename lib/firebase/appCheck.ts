import { CustomProvider, initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { app } from "./client";

// Mirrors CookPilot's App Check setup so RecipePrinter's callable requests pass
// the same App Check gate. Dev uses a registered debug token; production uses a
// reCAPTCHA v3 site key.
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

export const appCheck = (() => {
  if (typeof window === "undefined") return null;

  if (siteKey) {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Debug/dev mode — Firebase swaps in its debug attestation when the global
  // token above is set.
  return initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () =>
        Promise.resolve({
          token: "debug-placeholder",
          expireTimeMillis: Date.now() + 3_600_000,
        }),
    }),
    isTokenAutoRefreshEnabled: true,
  });
})();
