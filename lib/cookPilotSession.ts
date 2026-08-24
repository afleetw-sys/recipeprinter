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

export function rememberCookPilotSignedIn(signedIn: boolean) {
  if (signedIn) localStore.set(COOKPILOT_SIGNED_IN_STORAGE_KEY, "true");
  else localStore.remove(COOKPILOT_SIGNED_IN_STORAGE_KEY);
}
