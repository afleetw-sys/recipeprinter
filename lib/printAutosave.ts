/*
 * The decisions the autosave loop and the leave-the-page flush make, lifted out
 * of app/print/page.tsx without changing them. They are pure so the rules can be
 * tested; the timers, refs and effects that call them stay on the page.
 */

/**
 * What `lastSavedFingerprint` holds for a book that was just opened from the
 * account rather than saved by this page.
 *
 * It says "there is no baseline yet": the first autosave pass after a load
 * replaces it with the fingerprint of what was loaded, so opening a project
 * does not immediately look like an edit and write itself back. It is compared
 * in three places on the page, so it has a name — a typo in one of them would
 * quietly turn autosave off or on for every opened project.
 */
export const LOADED_BASELINE = "__loaded__";

export type AutosaveVerdict = "unchanged" | "already-attempted" | "save";

/**
 * Once the edits have settled, whether this fingerprint is worth a save.
 *
 * `already-attempted` is the retry-storm guard: a failed save (a permissions
 * error, say) never advances `lastSavedFingerprint`, so every status flip
 * re-fires the debounce and would re-schedule the identical save forever. One
 * attempt per genuine content change; manual retry and the reconnect handler
 * call the save directly, so real retries are unaffected.
 */
export function autosaveVerdict(
  fingerprint: string,
  lastSavedFingerprint: string | null,
  lastAttemptedFingerprint: string | null,
): AutosaveVerdict {
  if (fingerprint === lastSavedFingerprint) return "unchanged";
  if (fingerprint === lastAttemptedFingerprint) return "already-attempted";
  return "save";
}

export interface FlushOnHideState {
  autosaveEnabledForCurrentMode: boolean;
  projectAttachChecked: boolean;
  itemCount: number;
  /** A write is in flight. */
  saveInFlight: boolean;
  /** A write is waiting its turn, holding a snapshot of the book. */
  saveQueued: boolean;
  lastSavedFingerprint: string | null;
}

/**
 * Whether the tab going away should push a save to the account.
 *
 * It must never open the sign-in dialog on the way out, and must not write when
 * nothing changed, or every tab close would bump the revision other tabs are
 * editing against. The fingerprint is a `JSON.stringify` of the whole book, so
 * it is a callback that runs only once every cheaper check has passed.
 */
export function shouldFlushOnHide(state: FlushOnHideState, fingerprint: () => string): boolean {
  if (!state.autosaveEnabledForCurrentMode || !state.projectAttachChecked) return false;
  if (state.itemCount === 0) return false;
  // A save is already carrying this book — either in flight or waiting its
  // turn holding a snapshot of it.
  if (state.saveInFlight || state.saveQueued) return false;
  if (state.lastSavedFingerprint === LOADED_BASELINE) return false;
  return fingerprint() !== state.lastSavedFingerprint;
}
