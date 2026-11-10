"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { isBookPage } from "@/lib/bookPages";
import type { QueueItem } from "@/types/recipe";

/*
 * Undo and redo for the /print editor: one history across everything a cook
 * edits there, so a step never puts back half of a change.
 *
 * A single edit routinely lands in several stores at once. Deleting a recipe
 * takes it out of the queue, out of the print job, and (a render later, via
 * `syncSections`) out of its chapter; undoing only the queue half brings it
 * back in the first chapter instead of its own. So each store reports what it
 * just committed here, and changes arriving in one burst become one step.
 *
 * A step holds only what that edit changed, keyed finely (a meta field path, a
 * recipe id, a job member, a print setting), and undo writes back only those
 * keys. Anything else that moved in the meantime is left alone, which is what
 * lets an import land, or a photo finish uploading, between an edit and its
 * undo without the undo taking it away again.
 *
 * Not everything that changes is an edit. Three ways a change stays out:
 *  - its key is never tracked (`UNTRACKED_META_KEYS`, and a queue item that is
 *    still importing or failed);
 *  - it ran inside `withoutHistory`: photo URLs swapped after an upload, a
 *    project opened, an automatic theme correction;
 *  - it ran inside `asDerived`: state recomputed FROM an edit (a chapter list
 *    synced to the recipes), which joins the edit that caused it if it follows
 *    straight after and is otherwise dropped.
 *
 * Undo writes through each store's own commit, so it persists and autosaves
 * exactly like the edit did; nothing here talks to storage or Firestore.
 */

export type HistoryChannel = "meta" | "queue" | "job" | "settings";

interface Change {
  channel: HistoryChannel;
  /** Object channels: the field path. List channels: `[id]`. */
  path: string[];
  /** `undefined` means absent. */
  before: unknown;
  after: unknown;
  /** List channels: the id this member followed, so it goes back in place. */
  beforePrev?: string | null;
  afterPrev?: string | null;
}

interface Entry {
  id: number;
  changes: Map<string, Change>;
  lastAt: number;
  /** The text field the edit was typed in, so a burst of typing is one step. */
  field: Element | null;
}

export interface HistoryAdapter {
  read: () => unknown;
  write: (next: unknown) => void;
}

/** Steps kept. Older ones fall off the bottom. */
const HISTORY_CAP = 100;
/** Changes this close together are one action (several stores, one click). */
const BURST_MS = 120;
/** A pause longer than this in typing starts a new step. */
const TYPING_PAUSE_MS = 1200;
/** How long after an edit a derived change still counts as part of it. */
const DERIVED_FOLD_MS = 600;
/** After a reset, changes are the project arriving, not edits. */
const RESET_QUIET_MS = 800;

/**
 * Meta that records how the project got here rather than what is in it.
 * Undoing one would change nothing on the page and could repoint autosave.
 */
const UNTRACKED_META_KEYS = new Set([
  "projectId",
  "sourceProjectId",
  "cookbookWelcomeCompleted",
  "ownPhotosOnly",
  "lastImportSource",
  "cookbookIntent",
  "cookbookBornFresh",
]);

const LIST_CHANNELS = new Set<HistoryChannel>(["queue", "job"]);

let undoStack: Entry[] = [];
let redoStack: Entry[] = [];
/** The step still taking in changes; cleared by undo and redo. */
let openEntry: Entry | null = null;
let nextEntryId = 1;
let armed = false;
let applying = false;
let ambientDepth = 0;
let derivedDepth = 0;
let quietUntil = 0;
/** Effect-observed channels see a change a render after it is made, so a
    `withoutHistory` around one leaves a short-lived marker instead. */
let absorbUntil = 0;
const observed = new Map<HistoryChannel, unknown>();
const adapters = new Map<HistoryChannel, HistoryAdapter>();
const listeners = new Set<() => void>();

interface Snapshot {
  canUndo: boolean;
  canRedo: boolean;
}
let snapshot: Snapshot = { canUndo: false, canRedo: false };

function emit() {
  const next = { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
  if (next.canUndo === snapshot.canUndo && next.canRedo === snapshot.canRedo) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((value, index) => deepEqual(value, other[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((key) => key in right && deepEqual(left[key], right[key]));
}

/** True while typing goes to a field the browser keeps its own undo for. */
export function isTextEntry(el: Element | null): boolean {
  if (typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return (
      !el.readOnly &&
      !el.disabled &&
      ["", "text", "search", "url", "email", "tel", "number"].includes(el.type)
    );
  }
  return false;
}

function focusedTextField(): Element | null {
  if (typeof document === "undefined") return null;
  const el = document.activeElement;
  return isTextEntry(el) ? el : null;
}

function objectChanges(
  channel: HistoryChannel,
  prev: unknown,
  next: unknown,
  path: string[] = [],
  out: Change[] = [],
): Change[] {
  if (prev === next) return out;
  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = Array.from(new Set(Object.keys(prev).concat(Object.keys(next))));
    for (const key of keys) {
      if (path.length === 0 && channel === "meta" && UNTRACKED_META_KEYS.has(key)) continue;
      objectChanges(channel, prev[key], next[key], [...path, key], out);
    }
    return out;
  }
  if (!deepEqual(prev, next)) out.push({ channel, path, before: prev, after: next });
  return out;
}

function listMembers(channel: HistoryChannel, list: unknown): Array<[string, unknown]> {
  if (!Array.isArray(list)) return [];
  return channel === "job"
    ? (list as string[]).map((id) => [id, true])
    : (list as QueueItem[]).map((item) => [item.id, item]);
}

/**
 * Which list changes are edits.
 *
 * Something ARRIVING in the queue or the job is an import, never an edit,
 * except a blank or image page of the book's own, which the cook added by
 * hand. A recipe still importing or failed is not the cook's work yet either.
 * A ready recipe edited or removed is.
 */
function isListEdit(channel: HistoryChannel, before: unknown, after: unknown): boolean {
  if (channel === "job") return before !== undefined && after === undefined;
  const was = before as QueueItem | undefined;
  const is = after as QueueItem | undefined;
  if (!was) return Boolean(is && isBookPage(is));
  if (was.status !== "ready" || (is && is.status !== "ready")) return false;
  return true;
}

function listChanges(channel: HistoryChannel, prev: unknown, next: unknown): Change[] {
  const before = listMembers(channel, prev);
  const after = listMembers(channel, next);
  const beforeMap = new Map(before);
  const afterMap = new Map(after);
  const prevIdOf = (members: Array<[string, unknown]>) => {
    const map = new Map<string, string | null>();
    members.forEach(([id], index) => map.set(id, index === 0 ? null : members[index - 1]![0]));
    return map;
  };
  const beforePrev = prevIdOf(before);
  const afterPrev = prevIdOf(after);
  const ids = Array.from(new Set(before.map(([id]) => id).concat(after.map(([id]) => id))));
  const out: Change[] = [];
  for (const id of ids) {
    const was = beforeMap.get(id);
    const is = afterMap.get(id);
    if (was === is || deepEqual(was, is)) continue;
    if (!isListEdit(channel, was, is)) continue;
    out.push({
      channel,
      path: [id],
      before: was,
      after: is,
      beforePrev: beforePrev.get(id) ?? null,
      afterPrev: afterPrev.get(id) ?? null,
    });
  }
  return out;
}

function changesBetween(channel: HistoryChannel, prev: unknown, next: unknown): Change[] {
  return LIST_CHANNELS.has(channel)
    ? listChanges(channel, prev, next)
    : objectChanges(channel, prev, next);
}

function changeKey(change: Change) {
  return `${change.channel}\u0000${change.path.join("\u0000")}`;
}

function mergeInto(entry: Entry, changes: Change[]) {
  for (const change of changes) {
    const key = changeKey(change);
    const existing = entry.changes.get(key);
    if (!existing) {
      entry.changes.set(key, change);
      continue;
    }
    existing.after = change.after;
    existing.afterPrev = change.afterPrev;
    // Typed back to where it started: nothing left to undo for this key.
    if (deepEqual(existing.before, existing.after)) entry.changes.delete(key);
  }
}

/**
 * A store reports what it just committed. `next` is the whole new value; the
 * previous one is whatever was last reported for the channel.
 */
export function noteHistoryCommit(channel: HistoryChannel, next: unknown) {
  const hadPrev = observed.has(channel);
  const prev = observed.get(channel);
  observed.set(channel, next);
  if (!armed || applying || !hadPrev || prev === next) return;
  const at = now();
  if (ambientDepth > 0 || at < quietUntil) return;
  if (!LIST_CHANNELS.has(channel) && channel !== "meta" && at < absorbUntil) {
    absorbUntil = 0;
    return;
  }
  const changes = changesBetween(channel, prev, next);
  if (changes.length === 0) return;

  if (derivedDepth > 0) {
    if (openEntry && at - openEntry.lastAt < DERIVED_FOLD_MS) {
      mergeInto(openEntry, changes);
      dropIfEmpty(openEntry);
      emit();
    }
    return;
  }

  const field = focusedTextField();
  const joins =
    openEntry !== null &&
    (at - openEntry.lastAt < BURST_MS ||
      (field !== null && field === openEntry.field && at - openEntry.lastAt < TYPING_PAUSE_MS));
  if (joins && openEntry) {
    mergeInto(openEntry, changes);
    openEntry.lastAt = at;
    openEntry.field = field ?? openEntry.field;
    dropIfEmpty(openEntry);
  } else {
    const entry: Entry = { id: nextEntryId++, changes: new Map(), lastAt: at, field };
    mergeInto(entry, changes);
    if (entry.changes.size === 0) return;
    undoStack.push(entry);
    if (undoStack.length > HISTORY_CAP) undoStack.shift();
    openEntry = entry;
  }
  redoStack = [];
  emit();
}

function dropIfEmpty(entry: Entry) {
  if (entry.changes.size > 0) return;
  undoStack = undoStack.filter((candidate) => candidate !== entry);
  if (openEntry === entry) openEntry = null;
}

/** Runs `fn` without anything it changes becoming an undo step. */
export function withoutHistory<T>(fn: () => T): T {
  ambientDepth += 1;
  absorbUntil = now() + 400;
  try {
    return fn();
  } finally {
    ambientDepth -= 1;
  }
}

/**
 * Runs `fn` as a consequence of the edit just made: what it changes joins that
 * step, so undoing the edit undoes it too, and is dropped if no edit just
 * happened (an import landing, an undo being applied).
 */
export function asDerived<T>(fn: () => T): T {
  derivedDepth += 1;
  try {
    return fn();
  } finally {
    derivedDepth -= 1;
  }
}

/** Forgets every step: a different project, or the same one reloaded. */
export function resetHistory() {
  undoStack = [];
  redoStack = [];
  openEntry = null;
  quietUntil = now() + RESET_QUIET_MS;
  emit();
}

/** True once steps are being recorded, so a store can keep what undo needs. */
export function historyIsRecording() {
  return armed;
}

/** The step undo would take next, to tell whether it is still a given edit. */
export function latestHistoryStep(): number | null {
  return undoStack[undoStack.length - 1]?.id ?? null;
}

function setPath(target: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path as [string, ...string[]];
  const base = isPlainObject(target) ? target : {};
  const child = setPath(base[head], rest, value);
  const next = { ...base };
  if (child === undefined) delete next[head];
  else next[head] = child;
  return next;
}

function applyList(channel: HistoryChannel, list: unknown, changes: Change[], undo: boolean): unknown {
  const members = listMembers(channel, list);
  const restores: Array<{ id: string; value: unknown; prev: string | null }> = [];
  for (const change of changes) {
    const id = change.path[0]!;
    const value = undo ? change.before : change.after;
    const index = members.findIndex(([memberId]) => memberId === id);
    if (value === undefined) {
      if (index >= 0) members.splice(index, 1);
    } else if (index >= 0) {
      members[index] = [id, value];
    } else {
      restores.push({ id, value, prev: (undo ? change.beforePrev : change.afterPrev) ?? null });
    }
  }
  // Put members back after the one they followed. Several removed together
  // follow each other, so place whatever has its anchor and go round again.
  let pending = restores;
  while (pending.length > 0) {
    const waiting: typeof pending = [];
    for (const restore of pending) {
      if (restore.prev === null) {
        members.unshift([restore.id, restore.value]);
        continue;
      }
      const anchor = members.findIndex(([memberId]) => memberId === restore.prev);
      if (anchor >= 0) members.splice(anchor + 1, 0, [restore.id, restore.value]);
      else waiting.push(restore);
    }
    if (waiting.length === pending.length) {
      // Anchors gone for good: the end is the least surprising place.
      waiting.forEach((restore) => members.push([restore.id, restore.value]));
      break;
    }
    pending = waiting;
  }
  return channel === "job" ? members.map(([id]) => id) : members.map(([, value]) => value);
}

function applyEntry(entry: Entry, undo: boolean) {
  const byChannel = new Map<HistoryChannel, Change[]>();
  for (const change of Array.from(entry.changes.values())) {
    const list = byChannel.get(change.channel) ?? [];
    list.push(change);
    byChannel.set(change.channel, list);
  }
  applying = true;
  try {
    for (const [channel, changes] of Array.from(byChannel)) {
      const adapter = adapters.get(channel);
      if (!adapter) continue;
      let value = adapter.read();
      if (LIST_CHANNELS.has(channel)) {
        value = applyList(channel, value, changes, undo);
      } else {
        for (const change of changes) {
          value = setPath(value, change.path, undo ? change.before : change.after);
        }
      }
      observed.set(channel, value);
      adapter.write(value);
    }
  } finally {
    applying = false;
  }
}

export function undoEdit(): boolean {
  const entry = undoStack.pop();
  if (!entry) return false;
  openEntry = null;
  applyEntry(entry, true);
  redoStack.push(entry);
  emit();
  return true;
}

export function redoEdit(): boolean {
  const entry = redoStack.pop();
  if (!entry) return false;
  openEntry = null;
  applyEntry(entry, false);
  undoStack.push(entry);
  emit();
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_SNAPSHOT: Snapshot = { canUndo: false, canRedo: false };

/**
 * The page's end of the history: wires each store in, records while `ready`,
 * and owns the keyboard shortcuts. Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y act
 * only outside text fields, where the browser's own undo for that field is the
 * one the cook means.
 *
 * `job` and `settings` are page state, so they are reported from here, a
 * render after they change; `meta` and `queue` report from their own commits.
 */
export function useEditHistory({
  ready,
  adapters: channelAdapters,
  job,
  settings,
}: {
  ready: boolean;
  adapters: Record<HistoryChannel, HistoryAdapter>;
  job: unknown;
  settings: unknown;
}) {
  const adaptersRef = useRef(channelAdapters);
  adaptersRef.current = channelAdapters;

  useEffect(() => {
    (Object.keys(adaptersRef.current) as HistoryChannel[]).forEach((channel) => {
      adapters.set(channel, {
        read: () => adaptersRef.current[channel].read(),
        write: (next) => adaptersRef.current[channel].write(next),
      });
    });
    return () => {
      adapters.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    (["meta", "queue", "job", "settings"] as const).forEach((channel) => {
      observed.set(channel, adaptersRef.current[channel].read());
    });
    armed = true;
    resetHistory();
    return () => {
      armed = false;
      resetHistory();
    };
  }, [ready]);

  useEffect(() => {
    noteHistoryCommit("job", job);
  }, [job]);

  useEffect(() => {
    noteHistoryCommit("settings", settings);
  }, [settings]);

  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  const undo = useCallback(() => undoEdit(), []);
  const redo = useCallback(() => redoEdit(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey && !event.metaKey);
      if (!isUndo && !isRedo) return;
      if (isTextEntry(document.activeElement)) return;
      // A dialog is its own task; undoing the book behind it would change
      // pages the cook cannot see.
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (isUndo) undoEdit();
      else redoEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { ...state, undo, redo };
}
