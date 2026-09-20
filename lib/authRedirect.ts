import { sessionStore } from "@/lib/storage";

/**
 * "Is a redirect sign-in in flight?", answered without loading Firebase.
 *
 * Reading a redirect result is what makes the Firebase SDK load its cross-origin
 * auth iframe and Google's script, and on mobile and Safari it used to do that at
 * STARTUP, for every visitor, because the redirect resolver was handed to
 * `initializeAuth` and the SDK initialises it eagerly there (auth is not "ready"
 * until it has loaded). Nearly no page load is the return leg of a redirect, so
 * that was about 700ms of third-party loading, on the critical path, to answer a
 * question whose answer is almost always no.
 *
 * So the resolver is now passed at the call that needs it, and this marker says
 * when there is a redirect result worth reading. It is set the moment before a
 * redirect leaves the page and cleared once the result has been read, and it
 * lives in `sessionStorage` because the redirect returns to the same tab. The
 * SDK keeps its own pending flag in the same place, which is why this is not a
 * new limitation: a redirect that cannot return to this tab could not be
 * completed before either.
 *
 * The time limit only stops a marker left behind by a redirect that never came
 * back from costing every later load a read.
 */
const PENDING_KEY = "recipeprinter:auth-redirect-pending:v1";
const PENDING_TTL_MS = 15 * 60_000;

export function markAuthRedirectPending(): void {
  sessionStore.set(PENDING_KEY, String(Date.now()));
}

export function hasAuthRedirectPending(): boolean {
  const at = Number(sessionStore.get(PENDING_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < PENDING_TTL_MS;
}

export function clearAuthRedirectPending(): void {
  sessionStore.remove(PENDING_KEY);
}
