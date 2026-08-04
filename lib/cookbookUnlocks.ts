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
