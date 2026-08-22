import type { User } from "firebase/auth";
import { recipePrinterUserPath } from "./recipePrinterPaths";
import { localStore } from "@/lib/storage";

/**
 * Firestore is loaded on demand, like everywhere else in this codebase — and
 * here it matters more than anywhere else.
 *
 * This module used to `import { doc, runTransaction, serverTimestamp } from
 * "firebase/firestore"` at the top. It is reached from `CookPilotAuth` →
 * `AccountControl` → `SiteHeader`, and `SiteHeader` renders on EVERY route. So
 * that one static import pulled `@firebase/firestore` (328 KB) plus its `re2js`
 * regex-engine dependency (157 KB) into the eagerly-loaded chunk set of the
 * homepage, all sixteen SEO landing pages, and the FAQ/Features/About/How-it-
 * works pages — none of which touch Firestore, and all of which are statically
 * prerendered content pages carrying the organic search traffic.
 *
 * The measurement that found it: /export (same app, same styles, no SiteHeader)
 * was 172 KB First Load JS while /faq was 333 KB.
 *
 * Called once per sign-in at most (see the guards below), so paying a dynamic
 * import here costs nothing anyone can perceive.
 */
async function firestore() {
  const [{ doc, runTransaction, serverTimestamp }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("./db"),
  ]);
  return { doc, runTransaction, serverTimestamp, db: getDb() };
}

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

  const bootstrap = (async () => {
    const { doc, runTransaction, serverTimestamp, db } = await firestore();
    await runTransaction(db, async (transaction) => {
      const accountRef = doc(db, ...recipePrinterUserPath(uid));
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
    });
  })()
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
