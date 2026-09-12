// ─────────────────────────────────────────────────────────────────────────────
// A tiny keyed IndexedDB store, for the bytes that are too big for
// localStorage/sessionStorage's ~5MB budget.
//
// Two modules need this — the photos a Paprika import is holding but has not
// uploaded (lib/localPhotos.ts) and the photo bytes a landing-page capture
// hands to the workspace (lib/pendingImport.ts) — and they had a byte-for-byte
// copy of the same `openDb`/`put`/`get` each, differing only in three
// constants.
//
// They still open SEPARATE DATABASES, and that part is deliberate: two modules
// opening one database at different versions is a blocked-upgrade bug waiting
// to happen, and these two have nothing to say to each other. Sharing the
// plumbing is not the same as sharing the database, and this factory is how you
// get the first without the second.
//
// Nothing here throws. IndexedDB is unavailable in Safari private mode and
// under a full origin quota, and every caller has a survivable answer for that
// — a recipe arrives without its photo rather than the import failing — so a
// failure is `null`/`false`, never an exception to catch at each call site.
//
// Every operation opens and closes the database itself. The call sites used to
// do that in three steps (open, act, close) and a forgotten `close()` holds a
// version upgrade open for the whole page.
// ─────────────────────────────────────────────────────────────────────────────

function idbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export interface IdbStore {
  /** True only if the write actually committed. */
  put(key: string, value: unknown): Promise<boolean>;
  /** The stored value, or null if absent or unreadable. */
  get<T>(key: string): Promise<T | null>;
  /** Read and delete in ONE transaction, so a value can't be handed out twice. */
  take<T>(key: string): Promise<T | null>;
  /** Best-effort delete. Resolves either way — a leftover costs disk, not
      correctness. */
  remove(key: string): Promise<void>;
}

/**
 * A handle to one object store in one database.
 *
 * `version` is per-database and belongs to whichever module owns it; bump it
 * there, not here.
 */
export function idbStore(name: string, version: number, storeName: string): IdbStore {
  function open(): Promise<IDBDatabase | null> {
    if (!idbAvailable()) return Promise.resolve(null);
    return new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = window.indexedDB.open(name, version);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      // A blocked upgrade means another tab holds the old version open. There
      // is nothing to wait for that would not hang this call, so it reads as
      // "unavailable" like any other failure.
      request.onblocked = () => resolve(null);
    });
  }

  /** Opens, runs one operation, and always closes — including when the
      operation's own transaction throws on the way in. */
  async function withDb<T>(fallback: T, run: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await open();
    if (!db) return fallback;
    try {
      return await run(db);
    } finally {
      db.close();
    }
  }

  return {
    put(key, value) {
      return withDb(false, (db) =>
        new Promise<boolean>((resolve) => {
          try {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(value, key);
            // `oncomplete`, not the request's `onsuccess`: a put that is
            // issued is not a put that committed.
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          } catch {
            resolve(false);
          }
        }),
      );
    },

    get<T>(key: string) {
      return withDb<T | null>(null, (db) =>
        new Promise<T | null>((resolve) => {
          try {
            const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
            request.onsuccess = () => resolve((request.result as T) ?? null);
            request.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        }),
      );
    },

    take<T>(key: string) {
      return withDb<T | null>(null, (db) =>
        new Promise<T | null>((resolve) => {
          try {
            // One readwrite transaction for both halves: a reader that got the
            // value must be the only reader that ever does.
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const getReq = store.get(key);
            getReq.onsuccess = () => {
              const value = (getReq.result as T) ?? null;
              store.delete(key);
              resolve(value);
            };
            getReq.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        }),
      );
    },

    remove(key) {
      return withDb<void>(undefined, (db) =>
        new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
          } catch {
            resolve();
          }
        }),
      );
    },
  };
}
