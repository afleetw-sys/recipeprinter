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

import { idbStore } from "@/lib/idb";
import { sessionStore } from "@/lib/storage";
import type { QueueItem } from "@/types/recipe";

const DESCRIPTOR_KEY = "recipeprinter:pending-import:v1";
const IDB_IMAGES_KEY = "images";

// Its own database, separate from lib/localPhotos.ts's — see the note at the
// top of that file for why two modules must not share one. Only the plumbing
// is shared (lib/idb.ts).
const pendingImages = idbStore("recipeprinter", 1, "pending-import");

/** What the capture block asks the app to import on arrival. `ready` carries
    already-parsed recipes, whatever library they came from. */
export type PendingImport =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "ready"; recipes: QueueItem[] }
  /**
   * Photos as the cook chose them, still undecoded.
   *
   * The handoff used to carry data URLs, which meant the decode — a downscale
   * per file, and for HEIC a libheif transcode — ran on the page the cook was
   * leaving, with nothing on screen but a spinner, before the navigation was
   * allowed to start. That is the slowest handoff in the product spent on the
   * page least able to describe it.
   *
   * Handing over the files instead moves that work to /print, where
   * `addImageFiles` already owns exactly this shape: placeholder first, decode
   * and parse inside `runParse`. What stays behind on the way out is only the
   * cheap determination — format, count, per-file and total size
   * (`validateImageFiles`) — which is what "is this even importable" needs and
   * answers in microseconds.
   */
  | { kind: "imageFiles"; files: File[]; label: string }
  /**
   * The pre-decoded form. No longer written by anything; still read, because a
   * descriptor stashed before a deploy can be sitting in a tab after it — the
   * same reason `cookpilot` below is still understood.
   */
  | { kind: "images"; images: string[]; label: string };

// The sessionStorage descriptor never carries image bytes — for `images` it holds
// only the label and defers the data-URLs to IndexedDB.
type StoredDescriptor =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "ready"; recipes: QueueItem[] }
  // What "ready" was called when CookPilot was the only library source. A
  // descriptor written before a deploy can still be sitting in a tab after it.
  | { kind: "cookpilot"; recipes: QueueItem[] }
  | { kind: "images"; label: string };

/** Whether IndexedDB handed back the files form or the legacy data-URL form. */
function isFileList(value: unknown): value is File[] {
  return Array.isArray(value) && value.length > 0 && value[0] instanceof File;
}

/**
 * Store a pending import and return true if it was persisted. Callers should only
 * navigate to "/" once this resolves true, so the payload is guaranteed to be
 * waiting when the workspace mounts.
 */
export async function stashPendingImport(payload: PendingImport): Promise<boolean> {
  // A fresh capture supersedes any earlier abandoned one.
  clearPendingImport();

  if (payload.kind === "imageFiles" || payload.kind === "images") {
    // Files and data URLs go to the same IndexedDB key, under the same
    // descriptor: both are "the photos", and which form they are in is
    // something the read below can see for itself. A `File` survives the trip
    // because IndexedDB stores a structured clone, not JSON.
    const bytes = payload.kind === "imageFiles" ? payload.files : payload.images;
    if (!(await pendingImages.put(IDB_IMAGES_KEY, bytes))) return false;
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
    const stored = await pendingImages.take<string[] | File[]>(IDB_IMAGES_KEY);
    if (!stored || stored.length === 0) return null;
    if (isFileList(stored)) return { kind: "imageFiles", files: stored, label: descriptor.label };
    return { kind: "images", images: stored as string[], label: descriptor.label };
  }

  if (descriptor.kind === "cookpilot") return { kind: "ready", recipes: descriptor.recipes };

  return descriptor;
}

/**
 * Is an import already on its way in, without consuming it?
 *
 * Synchronous on purpose, and that is the whole point: `takePendingImport` is
 * async because image bytes live in IndexedDB, so a page asking "am I about to
 * receive recipes" could not get an answer until after its first paint — by
 * which time it had already committed to a whole-page loading screen. The
 * descriptor is in sessionStorage and answers on the first render.
 *
 * Deliberately does NOT read the bytes or clear anything. It is a question, and
 * `takePendingImport` remains the only way to collect the payload.
 */
export function hasPendingImport(): boolean {
  return sessionStore.getJson<StoredDescriptor>(DESCRIPTOR_KEY) !== null;
}

/** Drop any waiting pending import without consuming it (best-effort). */
export function clearPendingImport(): void {
  sessionStore.remove(DESCRIPTOR_KEY);
  void pendingImages.remove(IDB_IMAGES_KEY);
}
