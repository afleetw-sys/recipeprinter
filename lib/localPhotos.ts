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

import { idbStore } from "@/lib/idb";
import { uid } from "@/lib/ids";

// Its own database, not the one lib/pendingImport.ts opens — see the note at
// the top of this file. The plumbing is shared (lib/idb.ts); the database is
// not.
const photos = idbStore("recipeprinter-photos", 1, "local-photos");

// Object URLs are per-document and leak if you mint one per render, so each id
// gets exactly one for the life of the page.
const objectUrls = new Map<string, string>();

/**
 * Stores a photo and returns its id, or null if IndexedDB is unusable (Safari
 * private mode, a full origin quota). A null is survivable everywhere it's
 * called: the recipe simply arrives without its photo rather than the whole
 * import failing over an image.
 */
export async function putLocalPhoto(blob: Blob): Promise<string | null> {
  const id = uid();
  if (!(await photos.put(id, blob))) return null;
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
  const blob = await photos.get<unknown>(id);
  // Anything but a Blob is not a photo: the store is untyped, and a value left
  // by an older shape should read as "gone", not crash `createObjectURL`.
  if (!(blob instanceof Blob)) return null;
  return rememberLocalPhotoUrl(id, blob);
}

/**
 * URLs for a whole set of stored photos, in one pass over IndexedDB.
 *
 * The batch form exists because the single form is the wrong shape for the case
 * that actually matters. Photos are read back per SET, not one at a time — a
 * reopened tab rehydrating its queue, a saved project being opened, a Paprika
 * library landing — and every `localPhotoUrl` in a loop is its own database
 * open, awaited before the next one starts. A library of four hundred photos
 * paid four hundred sequential opens before a single picture appeared.
 *
 * Ids already holding an object URL never reach the store at all, so a second
 * call after a partial read costs nothing for what it already has. Ids with
 * nothing behind them are absent from the result rather than mapped to null:
 * the caller's question is "which of these can I show", and a missing entry
 * answers it.
 */
export async function localPhotoUrls(ids: readonly string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const id of ids) {
    const cached = objectUrls.get(id);
    if (cached) urls.set(id, cached);
    else missing.push(id);
  }
  if (missing.length === 0) return urls;

  const blobs = await photos.getMany<unknown>(missing);
  // `forEach`, not `for…of`: this project compiles without
  // `downlevelIteration`, so iterating a Map directly does not build.
  blobs.forEach((blob, id) => {
    // Anything but a Blob is not a photo — same reasoning as `localPhotoUrl`:
    // the store is untyped, and a value left by an older shape should read as
    // "gone" rather than crash `createObjectURL`.
    if (blob instanceof Blob) urls.set(id, rememberLocalPhotoUrl(id, blob));
  });
  return urls;
}

/** Drops a photo and its object URL. Best-effort: a photo that outlives its
    recipe costs a little disk, not correctness. */
export async function deleteLocalPhoto(id: string): Promise<void> {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
  await photos.remove(id);
}

/** True for a URL this module minted — i.e. one that dies with the document. */
export function isBlobUrl(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}
