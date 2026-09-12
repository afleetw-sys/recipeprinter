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
  /**
   * Several values, in ONE open and one transaction.
   *
   * Not a convenience wrapper over `get`. Every operation here opens and closes
   * the database itself (see the note at the top of this file), so N calls to
   * `get` in a loop is N database opens, run one after another — which is what
   * reading a Paprika library's photos back used to be, four hundred times over
   * on a cold tab, with nothing on screen until the last one landed.
   *
   * Keys that are absent or unreadable are simply missing from the result, so a
   * caller iterating the map gets exactly the ones it can use. A partial read
   * (the transaction failing part-way) resolves with what it managed, for the
   * same reason: a photo that came back is a photo we can show.
   */
  getMany<T>(keys: readonly string[]): Promise<Map<string, T>>;
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

    getMany<T>(keys: readonly string[]) {
      if (keys.length === 0) return Promise.resolve(new Map<string, T>());
      return withDb<Map<string, T>>(new Map(), (db) =>
        new Promise<Map<string, T>>((resolve) => {
          const found = new Map<string, T>();
          try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            // Deduped into an array rather than iterated as a Set: this
            // project compiles without `downlevelIteration`, so a `for…of`
            // over a Set does not build.
            const seen = new Set<string>();
            const unique: string[] = [];
            for (const key of keys) {
              if (seen.has(key)) continue;
              seen.add(key);
              unique.push(key);
            }
            // Every request issued up front, against the one transaction.
            // IndexedDB runs them without a round trip back to us in between,
            // which is the whole difference from a loop of awaits.
            for (const key of unique) {
              const request = store.get(key);
              request.onsuccess = () => {
                const value = request.result as T | undefined;
                if (value !== undefined) found.set(key, value);
              };
              // A single unreadable key is not a failed batch — it is a key
              // with nothing behind it, which is already how it reads.
              request.onerror = () => {};
            }
            // `oncomplete`, so the map is whole before anyone sees it. Error
            // and abort resolve with what landed rather than throwing the good
            // reads away with the bad one.
            tx.oncomplete = () => resolve(found);
            tx.onerror = () => resolve(found);
            tx.onabort = () => resolve(found);
          } catch {
            resolve(found);
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
