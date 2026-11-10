import { browserPopupRedirectResolver, type Auth, type PopupRedirectResolver } from "firebase/auth";
import { useFirebaseEmulators } from "@/lib/firebase/emulators";

/**
 * The Google/Apple sign-in resolver, and a way to start its slow parts before
 * the press.
 *
 * Measured from the press, cold, on a local production build (2026-11-10):
 *  - desktop popup: 410-500 ms before the popup even opened, all of it the SDK
 *    loading Google's gapi script and Firebase's cross-origin auth iframe, which
 *    it does only once a sign-in starts. Three seconds spent on the menu first
 *    warmed none of it.
 *  - phone redirect: 70-420 ms checking this origin against the project's
 *    authorized domains (one `getProjectConfig` call) before leaving the page.
 * Neither needs the press. Both are cached by the resolver INSTANCE, so warming
 * only helps if it is the same instance the sign-in call uses.
 *
 * The SDK makes that instance itself, one per class it is handed (it calls
 * `new` on whatever is passed as the resolver and caches the result by that
 * constructor), and keeps it out of reach. So the constructor handed to it here
 * always returns one shared resolver, which this module can also reach. Its
 * prototype is the real class's, so the SDK's own "is this an instance of what
 * I was given" check holds.
 *
 * `_initialize` and `_originValidation` are the SDK's internal names for the two
 * steps. If a Firebase update renames them, warming quietly does nothing and
 * sign-in works exactly as it did before this existed.
 */
interface ResolverInternals {
  _initialize?: (auth: Auth) => Promise<unknown>;
  _originValidation?: (auth: Auth) => Promise<void>;
  originValidationPromises?: Record<string, unknown>;
}

type ResolverClass = new () => ResolverInternals;
const RealResolver = browserPopupRedirectResolver as unknown as ResolverClass & { prototype: object };

let shared: ResolverInternals | null = null;
function sharedResolver(): ResolverInternals {
  shared ??= new RealResolver();
  return shared;
}

function SharedResolver(): ResolverInternals {
  return sharedResolver();
}
SharedResolver.prototype = RealResolver.prototype;

/** Pass this wherever `browserPopupRedirectResolver` would go. */
export const signInResolver = SharedResolver as unknown as PopupRedirectResolver;

/**
 * Start what a Google/Apple press would otherwise wait for. Call it when a
 * sign-in choice appears on screen. Idempotent: the resolver caches both steps,
 * and the press reuses whatever has finished or is still in flight.
 */
export function warmProviderSignIn(auth: Auth, via: "popup" | "redirect"): void {
  if (typeof window === "undefined") return;
  // Against the emulators there is nothing to win, and warming would fetch
  // Google's gapi script from a test run that must never leave localhost.
  if (useFirebaseEmulators) return;
  const resolver = sharedResolver();
  try {
    if (via === "popup") {
      // The popup waits on gapi and the auth iframe. A failure here is dropped:
      // the SDK forgets a failed load, and the press simply tries again.
      void resolver._initialize?.(auth).catch(() => {});
    } else {
      // The redirect waits on the origin check. The SDK keeps that promise even
      // when it fails, so a failed WARM-UP (a blip, nobody pressed anything) is
      // forgotten here; otherwise the press would replay a stale network error.
      const check = resolver._originValidation?.(auth);
      check?.catch(() => {
        const key = (auth as unknown as { _key?: () => string })._key?.();
        const cache = resolver.originValidationPromises;
        if (key && cache && cache[key] === check) delete cache[key];
      });
    }
  } catch {
    // Warming is an optimisation; nothing it does may stop the press working.
  }
}
