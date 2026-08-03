import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb } from "./db";
import { recipePrinterUserPath } from "./recipePrinterPaths";

const completedBootstraps = new Set<string>();
const pendingBootstraps = new Map<string, Promise<void>>();

/**
 * Creates the small Recipe Printer account shell when a real Firebase user
 * signs in. Purchases, grants, roles, and entitlements remain server-owned.
 */
export function ensureRecipePrinterAccount(user: User): Promise<void> {
  const { uid } = user;
  if (completedBootstraps.has(uid)) return Promise.resolve();

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
    })
    .finally(() => {
      pendingBootstraps.delete(uid);
    });

  pendingBootstraps.set(uid, bootstrap);
  return bootstrap;
}
