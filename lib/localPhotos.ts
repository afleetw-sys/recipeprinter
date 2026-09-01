// ─────────────────────────────────────────────────────────────────────────────
// Photos this browser is holding but has NOT uploaded.
//
// A Paprika export carries every recipe photo inside the file as base64. We
// don't upload those on import: a cook browsing their old library hasn't asked
// us to put four hundred photos in Firebase Storage, and most of them will
// never reach a printed page. A photo goes to Storage only when the recipe
// reaches somewhere that persists it — saving a project, exporting a cookbook —
// which is what `materializeProjectPhotos` in lib/photoStorage.ts already does.
//
// So the bytes live here, in IndexedDB, and the queue item carries only an id
// (`QueueItem.localPhotoId`). They can't live in the queue itself: it's
// mirrored to sessionStorage and localStorage, whose ~5MB budget a handful of
// base64 photos would blow, taking the whole working set down with it.
//
// Its own database, not the one lib/pendingImport.ts opens: two modules opening
// one database at different versions is a blocked-upgrade bug waiting to
// happen, and these two have nothing to say to each other.
// ─────────────────────────────────────────────────────────────────────────────

import { uid } from "@/lib/ids";

const IDB_NAME = "recipeprinter-photos";
const IDB_VERSION = 1;
const IDB_STORE = "local-photos";

// Object URLs are per-document and leak if you mint one per render, so each id
// gets exactly one for the life of the page.
const objectUrls = new Map<string, string>();

function idbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function put(db: IDBDatabase, key: string, value: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function get(db: IDBDatabase, key: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as unknown;
        resolve(value instanceof Blob ? value : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function remove(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Stores a photo and returns its id, or null if IndexedDB is unusable (Safari
 * private mode, a full origin quota). A null is survivable everywhere it's
 * called: the recipe simply arrives without its photo rather than the whole
 * import failing over an image.
 */
export async function putLocalPhoto(blob: Blob): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  const id = uid();
  const ok = await put(db, id, blob);
  db.close();
  if (!ok) return null;
  objectUrls.set(id, URL.createObjectURL(blob));
  return id;
}

/** Registers an object URL for a blob already being held in memory, so the
    picker's thumbnail and the queue item can share one URL for this id. */
export function rememberLocalPhotoUrl(id: string, blob: Blob): string {
  const existing = objectUrls.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

/** A usable `blob:` URL for a stored photo, or null if it isn't there any
    more. Memoized per id — object URLs are cheap to make and easy to leak. */
export async function localPhotoUrl(id: string): Promise<string | null> {
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const db = await openDb();
  if (!db) return null;
  const blob = await get(db, id);
  db.close();
  if (!blob) return null;
  return rememberLocalPhotoUrl(id, blob);
}

/** Drops a photo and its object URL. Best-effort: a photo that outlives its
    recipe costs a little disk, not correctness. */
export async function deleteLocalPhoto(id: string): Promise<void> {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
  const db = await openDb();
  if (!db) return;
  await remove(db, id);
  db.close();
}

/** True for a URL this module minted — i.e. one that dies with the document. */
export function isBlobUrl(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}
