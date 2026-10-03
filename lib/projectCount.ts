import { useEffect, useState } from "react";

/**
 * How many projects a signed-in account has, kept on this device.
 *
 * The account menu's "Projects" badge used to be read from Firestore when the
 * menu opened: every project in the account, listed, merged and counted, with
 * only a ten-second memory cache that every page load threw away. So the
 * number arrived a beat after the menu, nearly every time. The count barely
 * ever changes, and when it does it is because of something THIS app just did,
 * so it is kept here and pushed when it changes instead:
 *
 * - shown straight from the device the moment the menu opens;
 * - read once at sign-in (nothing stored yet, or stored long ago);
 * - re-read when a project is created or deleted (`projectLibraryChanged`,
 *   called from `savePrintProject` / `deletePrintProject`), and written
 *   directly by `/projects`, which already holds the whole list;
 * - checked quietly in the background when the menu opens and the number is
 *   more than a minute old, which catches a project made on another device.
 *
 * Only the number is stored, never project titles, so nothing about the
 * library is left on a shared device beyond how many there are.
 */

const KEY_PREFIX = "recipeprinter:project-count:v1:";
const CHANGE_EVENT = "recipeprinter:project-count";
/** Re-read at sign-in / page load when the stored number is older than this. */
export const PROJECT_COUNT_STALE_ON_LOAD_MS = 10 * 60_000;
/** Re-read in the background when the menu opens and it is older than this. */
export const PROJECT_COUNT_STALE_ON_OPEN_MS = 60_000;
/** Bulk deletes (the duplicate sweeper) settle into one re-read. */
const CHANGE_SETTLE_MS = 500;

export interface StoredProjectCount {
  count: number;
  at: number;
}

export type ProjectCountLoader = (uid: string) => Promise<number>;

function storageKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

export function readStoredProjectCount(uid: string): StoredProjectCount | null {
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProjectCount>;
    if (typeof parsed.count !== "number" || typeof parsed.at !== "number") return null;
    return { count: parsed.count, at: parsed.at };
  } catch {
    return null;
  }
}

export function storeProjectCount(uid: string, count: number, now = Date.now()): void {
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify({ count, at: now }));
  } catch {
    // Storage blocked: the badge just reads from the account each time, as before.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { uid, count } }));
}

/** The same merged count `/projects` shows, from the same rule. */
const defaultLoader: ProjectCountLoader = async (uid) => {
  const [{ loadPrintProjectSummaries, summarizePrintProject }, { loadLocalProjects }, { libraryProjects }] =
    await Promise.all([
      import("@/lib/printProjects"),
      import("@/lib/localProjects"),
      import("@/lib/projectLibrary"),
    ]);
  const accountProjects = await loadPrintProjectSummaries(uid);
  const localProjects = loadLocalProjects().map(summarizePrintProject);
  return libraryProjects({ accountProjects, localProjects }).length;
};

const inFlight = new Map<string, Promise<number | null>>();

/** Reads the real count and stores it. One read at a time per account; a
    failed read leaves the stored number as it was (a known count beats none). */
export function refreshProjectCount(uid: string, load: ProjectCountLoader = defaultLoader): Promise<number | null> {
  const running = inFlight.get(uid);
  if (running) return running;
  const next = load(uid)
    .then((count) => {
      storeProjectCount(uid, count);
      return count;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(uid));
  inFlight.set(uid, next);
  return next;
}

const pendingChanges = new Map<string, ReturnType<typeof setTimeout>>();

/** A project was created or deleted: re-read the count shortly, once, however
    many changes land together. */
export function projectLibraryChanged(uid: string, load: ProjectCountLoader = defaultLoader): void {
  if (typeof window === "undefined") return;
  const pending = pendingChanges.get(uid);
  if (pending) clearTimeout(pending);
  pendingChanges.set(
    uid,
    setTimeout(() => {
      pendingChanges.delete(uid);
      void refreshProjectCount(uid, load);
    }, CHANGE_SETTLE_MS),
  );
}

/**
 * The badge's number: what this device knows, immediately, kept current as it
 * changes. `open` is whether the menu is showing, which is when a stale number
 * is worth a background check.
 */
export function useProjectCount(
  uid: string | undefined,
  open: boolean,
  load: ProjectCountLoader = defaultLoader,
): number | null {
  const [count, setCount] = useState<number | null>(() => (uid ? readStoredProjectCount(uid)?.count ?? null : null));

  useEffect(() => {
    if (!uid) {
      setCount(null);
      return;
    }
    const stored = readStoredProjectCount(uid);
    setCount(stored?.count ?? null);
    if (!stored || Date.now() - stored.at > PROJECT_COUNT_STALE_ON_LOAD_MS) void refreshProjectCount(uid, load);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid: string; count: number }>).detail;
      if (detail?.uid === uid) setCount(detail.count);
    };
    // Another tab of this browser made or deleted a project.
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(uid)) setCount(readStoredProjectCount(uid)?.count ?? null);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
    // `load` is a seam for tests, not a value that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!open || !uid) return;
    const stored = readStoredProjectCount(uid);
    if (!stored || Date.now() - stored.at > PROJECT_COUNT_STALE_ON_OPEN_MS) void refreshProjectCount(uid, load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uid]);

  return count;
}
