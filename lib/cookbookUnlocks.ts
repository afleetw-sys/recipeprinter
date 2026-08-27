"use client";

import { localStore } from "@/lib/storage";
import {
  recipePrinterUnlockPath,
  recipePrinterUnlocksPath,
} from "@/lib/firebase/recipePrinterPaths";

const UNLOCKS_KEY = "recipeprinter:cookbook-unlocks:v1";
const PENDING_KEY = "recipeprinter:cookbook-unlock-pending:v1";

interface UnlockMap {
  [projectId: string]: { unlockedAt: number };
}

function unlocks(): UnlockMap {
  return localStore.getJson<UnlockMap>(UNLOCKS_KEY) ?? {};
}

export function isCookbookProjectUnlocked(projectId: string | undefined): boolean {
  return Boolean(projectId && unlocks()[projectId]);
}

export function markCookbookProjectUnlockedLocal(projectId: string): void {
  markCookbookProjectsUnlockedLocal([projectId]);
}

/** The bulk form — one read + one write for the whole batch. Marking ids one at
    a time re-reads, re-parses and re-serializes the entire map per id, which is
    the cost `loadCookbookProjectUnlockIds` exists to avoid in the first place. */
export function markCookbookProjectsUnlockedLocal(projectIds: readonly string[]): void {
  if (projectIds.length === 0) return;
  const map = unlocks();
  const unlockedAt = Date.now();
  let added = false;
  for (const projectId of projectIds) {
    if (map[projectId]) continue;
    map[projectId] = { unlockedAt };
    added = true;
  }
  if (added) localStore.setJson(UNLOCKS_KEY, map);
  const pending = localStore.get(PENDING_KEY);
  if (pending && projectIds.includes(pending)) localStore.remove(PENDING_KEY);
}

/**
 * Re-keys a local unlock when a project's id changes — chiefly anonymous →
 * adopted, where `adoptAnonymousProject` mints a fresh id on collision. Without
 * this the unlock, bought against the anonymous id, is stranded and the adopted
 * project reads as "not purchased".
 */
export function transferCookbookProjectUnlockLocal(fromProjectId: string, toProjectId: string): void {
  if (fromProjectId === toProjectId) return;
  const map = unlocks();
  const existing = map[fromProjectId];
  if (!existing) return;
  const { [fromProjectId]: _moved, ...rest } = map;
  localStore.setJson(UNLOCKS_KEY, { ...rest, [toProjectId]: existing });
  if (localStore.get(PENDING_KEY) === fromProjectId) localStore.set(PENDING_KEY, toProjectId);
}

/**
 * Drops a local unlock the server has disowned.
 *
 * Only called after a SUCCESSFUL server read that definitively found no
 * document — never on a network or permission failure, which is the absence of
 * an answer rather than a negative one. Revoking a paying customer because
 * their wifi dropped would be far worse than briefly trusting a stale marker.
 */
function clearCookbookProjectUnlockLocal(projectId: string): void {
  const map = unlocks();
  if (!map[projectId]) return;
  const { [projectId]: _removed, ...rest } = map;
  localStore.setJson(UNLOCKS_KEY, rest);
}

/**
 * How recently a local marker must have been written to survive a server "no".
 *
 * A signed-out purchase legitimately exists ONLY as a local marker until the
 * buyer signs in and RevenueCat's TRANSFER event lets the webhook write the
 * real document. During that window the server truthfully has nothing, and
 * clearing on that basis would revoke a book somebody just paid for. A marker
 * older than this can't be waiting on a transfer that never came, so it is
 * treated as stale — a deleted, refunded, or never-server-backed unlock.
 */
const LOCAL_UNLOCK_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function localUnlockIsRecent(projectId: string): boolean {
  const at = unlocks()[projectId]?.unlockedAt;
  return typeof at === "number" && Date.now() - at < LOCAL_UNLOCK_GRACE_MS;
}

export function markCookbookUnlockPending(projectId: string): void {
  localStore.set(PENDING_KEY, projectId);
}

export function pendingCookbookUnlock(): string | null {
  return localStore.get(PENDING_KEY);
}

/* `claimLegacyCookbookUnlock` and `markProjectScopedCookbookPurchase` lived
   here, along with the `recipeprinter:cookbook-legacy-claim:v1` key that
   guarded them. They existed to grandfather customers of a former
   account-wide unlock onto one project — a population that does not exist,
   since the cookbook has never shipped outside the `cookbook` branch. The
   guard was localStorage, so a fresh browser profile re-armed the grant and
   handed out another book. See lib/useCookbookPurchase.ts. */

/**
 * The one remaining client-side unlock write, and it is expected to FAIL.
 *
 * Unlocks are server-owned now: the RevenueCat webhook writes them with the
 * admin SDK (which bypasses rules), and `firestore.rules` denies every client
 * write to `cookbookUnlocks`. The single caller left is
 * `grantCookbookUnlock` in lib/duplicateProjects.ts, which moves a purchase
 * onto the copy it keeps — and which is built around the refusal: a rejected
 * write means "could not move the purchase", so the copy holding it survives
 * the cleanup instead of being deleted.
 *
 * The local marker is therefore set only AFTER the durable write lands. It used
 * to be set first, which meant a refused write still left the device claiming an
 * unlock the account does not have — harmless while clients could write, and
 * guaranteed to happen on every attempt once the rules lock down.
 */
export async function persistCookbookProjectUnlock(ownerUid: string, projectId: string): Promise<void> {
  const [{ doc, setDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await setDoc(doc(getDb(), ...recipePrinterUnlockPath(ownerUid, projectId)), {
    projectId,
    unlockedAt: Date.now(),
  });
  markCookbookProjectUnlockedLocal(projectId);
}

/**
 * Whether this account owns this project, asking the SERVER.
 *
 * This used to open with `if (isCookbookProjectUnlocked(projectId)) return true`
 * — a local short-circuit that made the function incapable of ever returning
 * false once the marker existed. That one line is why deleting every unlock
 * document revoked nothing, and why `/projects` (which reads Firestore) and the
 * print page (which read this) could sit on screen disagreeing with each other.
 *
 * The server is now the authority and the local map is a cache reconciled to it:
 *
 *  - document found        → unlocked, cache refreshed.
 *  - definitively absent   → locked, and the stale cache entry is dropped …
 *                            unless it is recent, which is the signed-out
 *                            purchase still waiting on its TRANSFER (see
 *                            `LOCAL_UNLOCK_GRACE_MS`).
 *  - couldn't ask          → no answer, so nothing is concluded and nothing is
 *                            changed; the cache stands.
 *
 * Callers without a uid can't use this at all — signed out there is no server to
 * ask, and `isCookbookProjectUnlocked` (the cache) remains the only answer.
 */
export async function loadCookbookProjectUnlock(ownerUid: string, projectId: string): Promise<boolean> {
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();

  let unlocked: boolean;
  try {
    const namespaced = await getDoc(doc(db, ...recipePrinterUnlockPath(ownerUid, projectId)));
    // The pre-namespace path is only consulted on a miss, and only to answer
    // "yes" — a miss on both is what makes the answer a definitive no.
    unlocked = namespaced.exists()
      ? true
      : (await getDoc(doc(db, "users", ownerUid, "cookbookUnlocks", projectId))).exists();
  } catch {
    // Offline, rules error, transient failure — an unanswered question, not a
    // negative answer. Leave the cache exactly as it is.
    return isCookbookProjectUnlocked(projectId);
  }

  if (unlocked) {
    markCookbookProjectUnlockedLocal(projectId);
    return true;
  }
  if (localUnlockIsRecent(projectId)) {
    // Bought while signed out, most likely; the webhook writes it on TRANSFER.
    return true;
  }
  clearCookbookProjectUnlockLocal(projectId);
  return false;
}

/* `reconcileCookbookProjectUnlocks` lived here: a best-effort heal that pushed
   every locally-known unlock up to Firestore on each authenticated visit. It
   existed to repair two client-write loss paths — a purchase whose write was
   swallowed, and a signed-out purchase that only ever reached localStorage.
   Both are the server's job now: the RevenueCat webhook writes the unlock on
   purchase, and a signed-out purchase is recorded against its anonymous id and
   granted on the TRANSFER event that fires when the buyer signs in. With client
   writes denied by the rules, this could only ever fail, so it is gone rather
   than left to retry forever. See docs/cookbook-unlock-webhook.md. */

/**
 * Every project id this owner has an unlock for, in two reads.
 *
 * The per-project `loadCookbookProjectUnlock` is the right shape when you hold
 * one project (the print page), but a LIST of projects was calling it once per
 * project — and each call is up to two `getDoc`s, since a miss on the namespaced
 * path falls back to the legacy one. Thirty saved books meant up to sixty round
 * trips to render thirty badges. Both collections are small (one tiny doc per
 * purchase), so reading them whole is cheaper than any number of point lookups.
 *
 * Fault-isolated per collection, matching `loadPrintProjects`: a rules change or
 * transient error on one path must not make every book read as unpurchased.
 * Also seeds the local marker for each hit, so a later per-project check on this
 * device short-circuits without touching the network at all.
 */
export async function loadCookbookProjectUnlockIds(ownerUid: string): Promise<Set<string>> {
  const [{ collection, getDocs }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const [namespaced, legacy] = await Promise.all([
    getDocs(collection(db, ...recipePrinterUnlocksPath(ownerUid))).catch(() => null),
    getDocs(collection(db, "users", ownerUid, "cookbookUnlocks")).catch(() => null),
  ]);
  const ids = new Set<string>();
  for (const snapshot of [namespaced, legacy]) {
    snapshot?.forEach((entry) => ids.add(entry.id));
  }
  markCookbookProjectsUnlockedLocal(Array.from(ids));
  return ids;
}

