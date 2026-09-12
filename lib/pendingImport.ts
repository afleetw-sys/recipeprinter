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

/**
 * Store a pending import and return true if it was persisted. Callers should only
 * navigate to "/" once this resolves true, so the payload is guaranteed to be
 * waiting when the workspace mounts.
 */
export async function stashPendingImport(payload: PendingImport): Promise<boolean> {
  // A fresh capture supersedes any earlier abandoned one.
  clearPendingImport();

  if (payload.kind === "images") {
    if (!(await pendingImages.put(IDB_IMAGES_KEY, payload.images))) return false;
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
    const images = await pendingImages.take<string[]>(IDB_IMAGES_KEY);
    if (!images || images.length === 0) return null;
    return { kind: "images", images, label: descriptor.label };
  }

  if (descriptor.kind === "cookpilot") return { kind: "ready", recipes: descriptor.recipes };

  return descriptor;
}

/** Drop any waiting pending import without consuming it (best-effort). */
export function clearPendingImport(): void {
  sessionStore.remove(DESCRIPTOR_KEY);
  void pendingImages.remove(IDB_IMAGES_KEY);
}
