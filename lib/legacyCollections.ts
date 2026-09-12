"use client";

import { localStore } from "@/lib/storage";

/**
 * Remembering that a pre-namespace collection is empty for an account, so we
 * stop asking.
 *
 * Several reads in this app still consult a legacy path after the namespaced
 * one misses — saved projects, cookbook unlocks. That compatibility is real and
 * has to stay until the backfill is verified (docs/firebase-inventory.md), but
 * for the overwhelming majority of accounts the legacy collection is simply
 * empty, and every one of those lookups is a round trip whose answer is known
 * in advance. Firestore bills a `get` on a document that isn't there exactly
 * like one that is.
 *
 * What makes a single observation permanent is that these collections can only
 * SHRINK. Nothing has written either of them since the namespace move — they
 * are read from and deleted from — so "empty" is a one-way door. That is the
 * same reasoning the saved-projects list has used since the split; this only
 * lifts it out so the unlock reads can have it too.
 *
 * Deliberately conservative in one direction: the marker is only ever set from
 * a SUCCESSFUL list that came back empty. A failed read is the absence of an
 * answer, not proof of emptiness, and a wrongly-set marker would hide a real
 * legacy document from the account that owns it. A missing marker only costs a
 * read.
 */

/** Keeps the record small; an evicted uid simply pays for the read again. */
const MAX_REMEMBERED_UIDS = 8;

function read(key: string): string[] {
  return (localStore.get(key) ?? "").split(",").filter(Boolean);
}

/** Whether this legacy collection has been observed empty for this account. */
export function legacyKnownEmpty(key: string, ownerUid: string): boolean {
  return read(key).includes(ownerUid);
}

/** Records a legacy collection as empty for this account. Idempotent. */
export function rememberLegacyEmpty(key: string, ownerUid: string): void {
  const existing = read(key);
  if (existing.includes(ownerUid)) return;
  localStore.set(key, [...existing, ownerUid].slice(-MAX_REMEMBERED_UIDS).join(","));
}

/** Saved projects at `users/{uid}/printProjects`. */
export const LEGACY_PROJECTS_EMPTY_KEY = "recipeprinter:legacy-projects-empty:v1";
/** Cookbook unlocks at `users/{uid}/cookbookUnlocks`. */
export const LEGACY_UNLOCKS_EMPTY_KEY = "recipeprinter:legacy-unlocks-empty:v1";
