"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

/**
 * Centralized RecipePrinter admin check: a boolean field on the same
 * `users/{uid}` Firestore doc `lib/recipePrinterFreeTemplateClaim.ts` already
 * reads from, set manually via the Firebase console for now. Every gate that
 * needs "is this an admin" (share-link creation UI, Firestore rules) reads
 * this one field, so broadening who can share later (e.g. any signed-in user
 * sharing their own recipe) means changing this one check, not hunting for
 * scattered ones.
 */
async function isRecipePrinterAdmin(uid: string): Promise<boolean> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const snap = await getDoc(doc(getDb(), "users", uid));
  return snap.data()?.recipePrinterAdmin === true;
}

/** Reactive wrapper around `isRecipePrinterAdmin` for the currently signed-in CookPilot user. */
export function useIsRecipePrinterAdmin(user: User | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    isRecipePrinterAdmin(user.uid)
      .then((result) => {
        if (!cancelled) setIsAdmin(result);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}
