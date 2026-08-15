import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb } from "./db";
import { recipePrinterUserPath } from "./recipePrinterPaths";
import { localStore } from "@/lib/storage";

const completedBootstraps = new Set<string>();
const pendingBootstraps = new Map<string, Promise<void>>();

// The bootstrap transaction (a read + a `lastSeenAt` write) ran on every page
// load because the in-memory guards above reset each load. `lastSeenAt` only
// needs day-level granularity, so skip the whole transaction when a prior load
// on this device wrote it recently — the marker's mere presence also proves the
// account shell already exists, so a new user's first load still creates it.
const SEEN_MARKER_PREFIX = "recipeprinter:account-seen:";
const SEEN_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h

function recentlySeen(uid: string): boolean {
  const at = Number(localStore.get(`${SEEN_MARKER_PREFIX}${uid}`));
  return Number.isFinite(at) && at > 0 && Date.now() - at < SEEN_THROTTLE_MS;
}

/**
 * Creates the small Recipe Printer account shell when a real Firebase user
 * signs in. Purchases, grants, roles, and entitlements remain server-owned.
 */
export function ensureRecipePrinterAccount(user: User): Promise<void> {
  const { uid } = user;
  if (completedBootstraps.has(uid)) return Promise.resolve();

  // A recent marker means the shell exists and `lastSeenAt` was bumped within
  // the throttle window — nothing to write, so avoid the read+write round trip.
  if (recentlySeen(uid)) {
    completedBootstraps.add(uid);
    return Promise.resolve();
  }

  const pending = pendingBootstraps.get(uid);
  if (pending) return pending;

  const bootstrap = runTransaction(getDb(), async (transaction) => {
    const accountRef = doc(getDb(), ...recipePrinterUserPath(uid));
    const account = await transaction.get(accountRef);
    const profile = {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      providerIds: Array.from(new Set(user.providerData.map((provider) => provider.providerId))),
    };

    if (account.exists()) {
      transaction.update(accountRef, {
        ...profile,
        lastSeenAt: serverTimestamp(),
      });
    } else {
      transaction.set(accountRef, {
        ...profile,
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    }
  })
    .then(() => {
      completedBootstraps.add(uid);
      localStore.set(`${SEEN_MARKER_PREFIX}${uid}`, String(Date.now()));
    })
    .finally(() => {
      pendingBootstraps.delete(uid);
    });

  pendingBootstraps.set(uid, bootstrap);
  return bootstrap;
}
