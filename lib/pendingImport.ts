// ─────────────────────────────────────────────────────────────────────────────
// Pending-import handoff.
//
// The SEO landing pages don't embed the full print workspace any more — they show
// a light capture input (URL / paste / photo) and then hand the visitor off to the
// real app at "/", already importing. This module is the carrier that survives that
// one client navigation.
//
// URL / text / CookPilot payloads are small and go in sessionStorage (which also
// self-clears when the tab closes — the right lifetime for pasted recipe text we
// never want to persist). A photo is a multi-megabyte JPEG data-URL, too big for
// sessionStorage's ~5MB budget, so its bytes live in IndexedDB with only a tiny
// descriptor in sessionStorage pointing at them.
//
// Every read is consume-and-delete: `takePendingImport()` returns the payload once
// and removes it, so a refresh can't re-import and nothing lingers.
// ─────────────────────────────────────────────────────────────────────────────

import { sessionStore } from "@/lib/storage";
import type { QueueItem } from "@/types/recipe";

const DESCRIPTOR_KEY = "recipeprinter:pending-import:v1";
const IDB_NAME = "recipeprinter";
const IDB_VERSION = 1;
const IDB_STORE = "pending-import";
const IDB_IMAGES_KEY = "images";

/** What the capture block asks the app to import on arrival. */
export type PendingImport =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "cookpilot"; recipes: QueueItem[] }
  | { kind: "images"; images: string[]; label: string };

// The sessionStorage descriptor never carries image bytes — for `images` it holds
// only the label and defers the data-URLs to IndexedDB.
type StoredDescriptor =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "cookpilot"; recipes: QueueItem[] }
  | { kind: "images"; label: string };

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

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
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

function idbTake<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
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
  });
}

async function idbClearImages(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await idbTake(db, IDB_IMAGES_KEY);
  db.close();
}

/**
 * Store a pending import and return true if it was persisted. Callers should only
 * navigate to "/" once this resolves true, so the payload is guaranteed to be
 * waiting when the workspace mounts.
 */
export async function stashPendingImport(payload: PendingImport): Promise<boolean> {
  // A fresh capture supersedes any earlier abandoned one.
  clearPendingImport();

  if (payload.kind === "images") {
    const db = await openDb();
    if (!db) return false;
    const ok = await idbPut(db, IDB_IMAGES_KEY, payload.images);
    db.close();
    if (!ok) return false;
    const descriptor: StoredDescriptor = { kind: "images", label: payload.label };
    return sessionStore.setJson(DESCRIPTOR_KEY, descriptor);
  }

  return sessionStore.setJson(DESCRIPTOR_KEY, payload);
}

/** Read the pending import exactly once, removing it (and any IndexedDB bytes). */
export async function takePendingImport(): Promise<PendingImport | null> {
  const descriptor = sessionStore.getJson<StoredDescriptor>(DESCRIPTOR_KEY);
  sessionStore.remove(DESCRIPTOR_KEY);
  if (!descriptor) return null;

  if (descriptor.kind === "images") {
    const db = await openDb();
    const images = db ? await idbTake<string[]>(db, IDB_IMAGES_KEY) : null;
    db?.close();
    if (!images || images.length === 0) return null;
    return { kind: "images", images, label: descriptor.label };
  }

  return descriptor;
}

/** Drop any waiting pending import without consuming it (best-effort). */
export function clearPendingImport(): void {
  sessionStore.remove(DESCRIPTOR_KEY);
  void idbClearImages();
}
