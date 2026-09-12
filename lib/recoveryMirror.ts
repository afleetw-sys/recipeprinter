"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Which tab the durable recovery mirrors came from.
//
// The working copy is mirrored to localStorage in TWO independent places: the
// recipes (lib/queue) and the section/cover/identity metadata around them
// (lib/project). Each has its own key and its own write throttle, and a fresh
// tab reseeds itself from each one separately.
//
// That is fine with one tab and wrong with two. Both tabs write both keys, on
// unrelated timers, so whatever is in storage at any moment is simply the last
// write to each — and the two can easily be from different tabs. A reopened tab
// then recovers one book's RECIPES under another book's IDENTITY: `projectId`,
// cover and chapters from tab B, recipes from tab A. `buildSections` drops the
// itemIds it cannot resolve and quietly pours tab A's recipes into tab B's
// first chapter, the reattach check matches that projectId to tab B's saved
// document, and the next autosave writes A's recipes over B's book.
//
// Nothing in the payloads themselves can catch this: the queue is an array of
// recipes that knows nothing about projects, and the meta's `projectId` is the
// very field being trusted. So each mirror is stamped with the id of the tab
// that wrote it, and recovery refuses to combine two that disagree.
//
// The stamp is deliberately a SEPARATE key per mirror rather than a wrapper
// around the payload: the payloads are read by code that has parsed them the
// same way since the first release, and a torn write (payload stored, stamp
// not) reads as a disagreement, which is the safe direction.
// ─────────────────────────────────────────────────────────────────────────────

import { uid } from "@/lib/ids";
import { localStore, sessionStore } from "@/lib/storage";

export const QUEUE_RECOVERY_OWNER_KEY = "recipeprinter:queue:recovery:owner:v1";
export const META_RECOVERY_OWNER_KEY = "recipeprinter:project-meta:recovery:owner:v1";

/** Per-TAB, not per-document. Held in sessionStorage so a hard navigation
    inside one tab (`/` → `/print`) keeps the same identity — otherwise a tab
    would stop recognising the mirrors it had written a moment earlier, and its
    own reopen would read as a cross-tab mix. */
const OWNER_ID_KEY = "recipeprinter:recovery-owner:v1";

export function recoveryOwnerId(): string {
  const existing = sessionStore.get(OWNER_ID_KEY);
  if (existing) return existing;
  const minted = uid();
  sessionStore.set(OWNER_ID_KEY, minted);
  return minted;
}

/** Records this tab as the author of one mirror. Called from the same place
    that writes it, so the two travel together. */
export function stampRecoveryOwner(key: string): void {
  localStore.set(key, recoveryOwnerId());
}

/**
 * Whether the two mirrors currently in storage were written by one tab, and can
 * therefore be recovered as a matching pair.
 *
 * Both stamps absent means both mirrors predate this check. They were written
 * by whatever the single mirror-writing tab was at the time, which is the same
 * situation this has always assumed, so they are recovered as before rather
 * than thrown away on the release that adds the stamp.
 *
 * One present and one absent is a disagreement: the stamped mirror has been
 * rewritten by a tab running this code and the unstamped one has not, so they
 * are from different moments at best. It self-heals on the next write of the
 * quiet mirror.
 */
export function recoveryMirrorsAgree(): boolean {
  const queueOwner = localStore.get(QUEUE_RECOVERY_OWNER_KEY);
  const metaOwner = localStore.get(META_RECOVERY_OWNER_KEY);
  if (queueOwner === null && metaOwner === null) return true;
  return queueOwner !== null && queueOwner === metaOwner;
}
