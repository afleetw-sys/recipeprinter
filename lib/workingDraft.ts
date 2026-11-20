"use client";
import { localStore, sessionStore } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────────
// The device's backup of the working copy, as ONE record.
//
// Each tab keeps its working copy in sessionStorage: the recipes (lib/queue),
// the book around them, with its cover, chapters, mode and identity
// (lib/project), and the saved version it was edited from (lib/workingBase).
// sessionStorage dies with the tab, and phones throw background tabs away all
// the time, so the copy is also backed up to localStorage, where a fresh tab
// finds it.
//
// That backup used to be three records, each written on its own timer, with a
// stamp naming the tab that wrote each one, and a fresh tab refused any pair
// whose stamps disagreed. The stamps were there because two tabs could leave
// one book's recipes beside another book's identity, and the next autosave
// then wrote one book over the other. But a book that had no recipes yet never
// wrote its recipe record at all, so its settings always looked unmatched: on
// 2026-11-19 a cook started a cookbook, went to Pinterest for a link, and came
// back to an empty Recipe cards page.
//
// Now the three are saved together, in one write, as one snapshot of one tab.
// A snapshot cannot disagree with itself, so there is nothing to pair and no
// stamp to check, and an empty book is saved like any other. With two tabs open
// the last snapshot wins whole: never a mix of two books. Keeping every book
// is what the Projects shelf and the account are for; this only has to bring
// back the tab the cook was in.
//
// Recovery happens once per tab, the first time anything reads the working
// copy, and fills all three session copies from the one snapshot together.
// After that the tab's own session copy is the truth, and a later write from
// another tab is never pulled into it.
// ─────────────────────────────────────────────────────────────────────────────

/** This tab's working copy, per tab (see lib/queue, lib/project, lib/workingBase). */
export const QUEUE_SESSION_KEY = "recipeprinter:queue:v1";
export const META_SESSION_KEY = "recipeprinter:project-meta:v1";
export const BASE_SESSION_KEY = "recipeprinter:working-base:v1";

/** The device's one snapshot of the last tab's working copy. */
export const WORKING_DRAFT_KEY = "recipeprinter:working-draft:v2";
/** Set once this tab has looked for a snapshot to recover, so it only ever does it once. */
const RECOVERED_FLAG_KEY = "recipeprinter:working-draft:recovered:v2";

/** The three records the snapshot replaced, and the stamps that paired them. */
const LEGACY_KEYS = {
  queue: "recipeprinter:queue:recovery:v1",
  meta: "recipeprinter:project-meta:recovery:v1",
  base: "recipeprinter:working-base:v1",
  queueOwner: "recipeprinter:queue:recovery:owner:v1",
  metaOwner: "recipeprinter:project-meta:recovery:owner:v1",
  baseOwner: "recipeprinter:working-base:owner:v1",
} as const;

interface Snapshot {
  /** JSON of the recipes. */
  queue: string;
  /** JSON of the book's metadata, or null when there is none to restore. */
  meta: string | null;
  /** JSON of the saved version the copy was edited from, or null. */
  base: string | null;
}

let saveFailureWarned = false;

/**
 * Backs up this tab's working copy, all of it, in one write.
 *
 * Called after any of the three session copies changes. It reads the other two
 * from this tab's own session, so the snapshot is always one tab at one moment.
 * A tab that has never written its recipes (an empty book) is saved with none.
 *
 * The session values are JSON this app wrote, so they are joined as they are
 * rather than parsed and serialized again: on a big book that is the
 * difference between one string join and a few hundred kilobytes of
 * `JSON.stringify` per save.
 */
export function saveWorkingDraft(): boolean {
  const queue = sessionStore.get(QUEUE_SESSION_KEY) ?? "[]";
  const meta = sessionStore.get(META_SESSION_KEY) ?? "null";
  const base = sessionStore.get(BASE_SESSION_KEY) ?? "null";
  const saved = localStore.set(
    WORKING_DRAFT_KEY,
    `{"v":2,"savedAt":${Date.now()},"queue":${queue},"meta":${meta},"base":${base}}`,
  );
  if (saved) clearLegacyRecords();
  // The failure that matters is quota: the device shelf shares this origin, so
  // a heavy account can fill it, and from then on nothing here is backed up.
  // Once per page, because a full origin fails on every write.
  else if (!saveFailureWarned) {
    saveFailureWarned = true;
    console.warn(
      "RecipePrinter: the working copy could not be backed up (storage full or unavailable). Work in this tab will not survive closing it.",
    );
  }
  return saved;
}

/**
 * Fills this tab's session copies from the device's snapshot, once per tab.
 *
 * Only a tab that has nothing of its own yet takes it: a tab handed a deck
 * (lib/printHandoff), or one that has already written, keeps what it has.
 * Safe to call from every read; after the first call it does nothing.
 */
export function recoverWorkingDraft(): void {
  if (sessionStore.get(RECOVERED_FLAG_KEY) !== null) return;
  sessionStore.set(RECOVERED_FLAG_KEY, "1");
  if (sessionStore.get(QUEUE_SESSION_KEY) !== null || sessionStore.get(META_SESSION_KEY) !== null) return;
  // Records in the old format are newer than any snapshot, when there are
  // any: every snapshot save deletes them, so only a tab still running the
  // previous release can have written them since.
  const snapshot = legacySnapshot() ?? storedSnapshot();
  if (!snapshot) return;
  sessionStore.set(QUEUE_SESSION_KEY, snapshot.queue);
  if (snapshot.meta !== null) sessionStore.set(META_SESSION_KEY, snapshot.meta);
  if (snapshot.base !== null) sessionStore.set(BASE_SESSION_KEY, snapshot.base);
}

function storedSnapshot(): Snapshot | null {
  const draft = localStore.getJson<{ v?: unknown; queue?: unknown; meta?: unknown; base?: unknown }>(WORKING_DRAFT_KEY);
  if (!draft || draft.v !== 2 || !Array.isArray(draft.queue)) return null;
  const isRecord = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
  return {
    queue: JSON.stringify(draft.queue),
    meta: isRecord(draft.meta) ? JSON.stringify(draft.meta) : null,
    base: isRecord(draft.base) ? JSON.stringify(draft.base) : null,
  };
}

/**
 * The previous release's three records, read by its own rule, except that
 * book settings with no recipe record beside them are a book with no recipes
 * yet (whose empty list was never written), not a mismatch.
 */
function legacySnapshot(): Snapshot | null {
  const queue = localStore.get(LEGACY_KEYS.queue);
  const meta = localStore.get(LEGACY_KEYS.meta);
  if (queue === null && meta === null) return null;
  const queueOwner = localStore.get(LEGACY_KEYS.queueOwner);
  const metaOwner = localStore.get(LEGACY_KEYS.metaOwner);
  const baseOwner = localStore.get(LEGACY_KEYS.baseOwner);
  const together =
    (queueOwner === null && metaOwner === null) ||
    (queueOwner !== null && queueOwner === metaOwner) ||
    (queue === null && metaOwner !== null);
  return {
    queue: queue ?? "[]",
    meta: together ? meta : null,
    base: together && baseOwner !== null && baseOwner === metaOwner ? localStore.get(LEGACY_KEYS.base) : null,
  };
}

/** On every save, so old-format records only ever exist when they are newer. */
function clearLegacyRecords(): void {
  for (const key of Object.values(LEGACY_KEYS)) localStore.remove(key);
}
