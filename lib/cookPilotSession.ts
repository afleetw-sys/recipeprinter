"use client";

import { localStore } from "@/lib/storage";

/**
 * "Has this browser ever been signed in?" — answered without loading Firebase.
 *
 * Split out of components/CookPilotAuth so it can be read from the header
 * before deciding whether to load the account menu at all. That module pulls
 * `firebase/auth`, which is the thing the question exists to avoid fetching:
 * a visitor who has never signed in has no account UI to prepare, and on a
 * statically-rendered FAQ or landing page they are most of the traffic.
 *
 * Firebase Auth remains the source of truth. This only decides how eagerly to
 * go and ask it.
 */

export const COOKPILOT_SIGNED_IN_STORAGE_KEY = "recipeprinter:cookpilot-was-signed-in:v1";

export function readCookPilotWasSignedIn(): boolean {
  // Can't tell — assume they were. An absent key means "not signed in", but an
  // *unreadable* one must not: guessing "signed out" here would flash a
  // logged-out UI at someone whose Firebase session is about to rehydrate.
  if (!localStore.available()) return true;
  return localStore.get(COOKPILOT_SIGNED_IN_STORAGE_KEY) === "true";
}

/**
 * Told when the answer above changes, without loading Firebase either.
 *
 * The header decides ONCE, at mount, whether to fetch the account menu, and
 * the only signed-in surface it has until then is a generic person icon. But
 * signing in does not happen in the header: it happens in the workspace's own
 * login dialog, in the save prompt, on /projects. So the first sign-in in a
 * browser left the header reading "signed out" — no initials, no confirmation
 * that a Google popup that had just closed had actually worked — until the
 * next full page load. This is how the header hears about it in time, and it
 * still costs the SEO pages nothing: the signal comes from whoever already
 * loaded Firebase, not from loading it here.
 */
type SignedInListener = (signedIn: boolean) => void;
const signedInListeners = new Set<SignedInListener>();

export function onCookPilotSignedInChange(listener: SignedInListener): () => void {
  signedInListeners.add(listener);
  return () => {
    signedInListeners.delete(listener);
  };
}

export function rememberCookPilotSignedIn(signedIn: boolean) {
  // Fired by every `onAuthStateChanged`, token refreshes included, so only a
  // real change is announced.
  const changed = readCookPilotWasSignedIn() !== signedIn;
  if (signedIn) localStore.set(COOKPILOT_SIGNED_IN_STORAGE_KEY, "true");
  else localStore.remove(COOKPILOT_SIGNED_IN_STORAGE_KEY);
  if (changed) signedInListeners.forEach((listener) => listener(signedIn));
}
