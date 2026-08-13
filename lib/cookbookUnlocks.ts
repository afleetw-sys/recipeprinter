"use client";

import { localStore } from "@/lib/storage";
import {
  recipePrinterUnlockPath,
  recipePrinterUnlocksPath,
} from "@/lib/firebase/recipePrinterPaths";

const UNLOCKS_KEY = "recipeprinter:cookbook-unlocks:v1";
const PENDING_KEY = "recipeprinter:cookbook-unlock-pending:v1";
const LEGACY_CLAIM_KEY = "recipeprinter:cookbook-legacy-claim:v1";

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
  localStore.setJson(UNLOCKS_KEY, {
    ...unlocks(),
    [projectId]: { unlockedAt: Date.now() },
  });
  if (localStore.get(PENDING_KEY) === projectId) localStore.remove(PENDING_KEY);
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

export function markCookbookUnlockPending(projectId: string): void {
  localStore.set(PENDING_KEY, projectId);
}

export function pendingCookbookUnlock(): string | null {
  return localStore.get(PENDING_KEY);
}

/** Grants one current project to customers who owned the legacy global unlock. */
export function claimLegacyCookbookUnlock(projectId: string): boolean {
  if (localStore.get(LEGACY_CLAIM_KEY)) return false;
  markCookbookProjectUnlockedLocal(projectId);
  localStore.set(LEGACY_CLAIM_KEY, projectId);
  return true;
}

/** Prevents a new project-scoped purchase from later being mistaken for legacy ownership. */
export function markProjectScopedCookbookPurchase(projectId: string): void {
  localStore.set(LEGACY_CLAIM_KEY, projectId);
}

export async function persistCookbookProjectUnlock(ownerUid: string, projectId: string): Promise<void> {
  markCookbookProjectUnlockedLocal(projectId);
  const [{ doc, setDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  await setDoc(doc(getDb(), ...recipePrinterUnlockPath(ownerUid, projectId)), {
    projectId,
    unlockedAt: Date.now(),
  });
}

export async function loadCookbookProjectUnlock(ownerUid: string, projectId: string): Promise<boolean> {
  if (isCookbookProjectUnlocked(projectId)) return true;
  const [{ doc, getDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  let snap = await getDoc(doc(db, ...recipePrinterUnlockPath(ownerUid, projectId))).catch(() => null);
  if (!snap?.exists()) {
    snap = await getDoc(doc(db, "users", ownerUid, "cookbookUnlocks", projectId));
  }
  if (!snap?.exists()) return false;
  markCookbookProjectUnlockedLocal(projectId);
  return true;
}

/**
 * Best-effort heal: pushes every locally-known unlock into Firestore for this
 * owner. Covers the two client-only loss paths — a purchase whose Firestore
 * write was swallowed (`useCookbookPurchase` catches and moves on), and a
 * signed-out purchase that only ever wrote localStorage. Idempotent: it skips
 * docs that already exist (a create-only rule forbids re-writing them) and
 * swallows per-doc failures so one bad write can't abort the rest. Runs on any
 * authenticated visit — including `/projects`, which otherwise never retries.
 */
export async function reconcileCookbookProjectUnlocks(ownerUid: string): Promise<void> {
  const local = unlocks();
  const projectIds = Object.keys(local);
  if (projectIds.length === 0) return;
  const [{ doc, getDoc, setDoc }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  await Promise.all(
    projectIds.map(async (projectId) => {
      try {
        const ref = doc(db, ...recipePrinterUnlockPath(ownerUid, projectId));
        if ((await getDoc(ref)).exists()) return;
        await setDoc(ref, { projectId, unlockedAt: local[projectId]?.unlockedAt ?? Date.now() });
      } catch {
        // Leave it for the next authenticated visit.
      }
    }),
  );
  const pending = localStore.get(PENDING_KEY);
  if (pending && local[pending]) localStore.remove(PENDING_KEY);
}

export async function hasAnyCookbookProjectUnlock(ownerUid: string): Promise<boolean> {
  const [{ collection, getDocs, limit, query }, { getDb }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
  ]);
  const db = getDb();
  const [namespaced, legacy] = await Promise.all([
    getDocs(query(collection(db, ...recipePrinterUnlocksPath(ownerUid)), limit(1))).catch(() => null),
    getDocs(query(collection(db, "users", ownerUid, "cookbookUnlocks"), limit(1))),
  ]);
  return Boolean(namespaced && !namespaced.empty) || !legacy.empty;
}
