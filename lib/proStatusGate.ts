import { useCallback, useEffect, useRef } from "react";
import type { CustomerInfoLoadStatus } from "@/lib/proAccessFallback";

/**
 * Whether this page knows yet if the account has Pro.
 *
 * Right after sign-in neither source has answered: RevenueCat's live read and
 * the account's saved copy of its entitlements (lib/proAccessFallback.ts). Until
 * one does, the account reads as free, so a Pro member who clicked "Add more"
 * in that moment was shown the upgrade dialog. Signed out it's known at once:
 * nobody owns anything signed out (purchases require sign-in).
 */
export function proStatusKnown({
  authReady,
  signedIn,
  liveStatus,
  profileSettled,
}: {
  authReady: boolean;
  signedIn: boolean;
  liveStatus: CustomerInfoLoadStatus;
  profileSettled: boolean;
}): boolean {
  if (!authReady) return false;
  if (!signedIn) return true;
  return liveStatus === "ok" || profileSettled;
}

/**
 * Holds an action asked for before `known`, and runs it once `known` is true,
 * through the latest `run` so it reads the answer rather than the guess it was
 * clicked under. A newer request replaces an older one.
 */
export function useRunWhenKnown<Intent>(known: boolean, run: (intent: Intent) => void) {
  const runRef = useRef(run);
  runRef.current = run;
  const pendingRef = useRef<{ intent: Intent } | null>(null);
  useEffect(() => {
    if (!known || !pendingRef.current) return;
    const { intent } = pendingRef.current;
    pendingRef.current = null;
    runRef.current(intent);
  }, [known]);
  return useCallback((intent: Intent) => {
    pendingRef.current = { intent };
  }, []);
}
