import type { ProjectMeta } from "@/lib/project";
import type { PrintLayoutSettings } from "@/lib/printProjects";
import type { PrintProject, QueueItem } from "@/types/recipe";

// Pieces of the save path that need no React: the change-detection signature,
// the shape of a queued save, and the give-up timeout. They lived at the top of
// app/print/page.tsx; they are here so the save state machine can be tested
// without mounting the page.

// Content signature used for autosave change-detection. A single source of truth
// so the debounced autosave check and the post-save baseline (in handleSaveProject)
// can never drift into non-comparable strings. Called lazily — only when there is
// actually a project to save, and only once per debounce settle — never eagerly on
// every keystroke (this is a JSON.stringify of the entire book).
//
// Takes the layout settings as the one object the rest of this file already
// passes around (`currentLayoutSettings`) rather than seven positional flags.
// The flags were the reason `showDescription` could go missing from a signature
// that read it everywhere else: one more argument at one of three call sites is
// a silent omission, one more field on a typed object is a compile error.
export function printProjectFingerprint(
  items: QueueItem[] | null,
  meta: ProjectMeta,
  layout: PrintLayoutSettings,
): string {
  return JSON.stringify({ items, meta, ...layout });
}

/**
 * Everything a save needs, taken at the moment the save was asked for.
 *
 * The document is what gets written; the workspace it was assembled from is
 * what the post-save baseline is computed against, so "what we last saved"
 * describes the book that was actually written rather than whatever is on
 * screen by the time the write lands.
 */
export interface PendingSave {
  project: PrintProject;
  items: QueueItem[] | null;
  meta: ProjectMeta;
  layout: PrintLayoutSettings;
  /** The cook answered "Newer version found" by choosing to overwrite, and this
      is the write that answer authorized. Carried here rather than read from a
      ref when the write finally runs: the approval is cleared as soon as the
      save it belongs to has been asked for, so a save that had to wait its turn
      used to arrive at the adoption path with the answer already gone and meet
      the same refusal the cook had just overruled. */
  overwriteApproved: boolean;
}

/**
 * How long a single save may take before the page stops claiming to be doing it.
 *
 * Not a nicety. `saveInFlightRef` is a latch — while it is set, every autosave
 * steps aside for the one in flight — so a write that never settles does not
 * just stall itself, it stalls every save for the rest of the session, under a
 * spinner that goes on saying "Saving…". Firestore's `runTransaction` needs a
 * server round trip and does not fail fast when the connection is wedged rather
 * than plainly offline (a backgrounded phone tab is the common way to get
 * there), and a photo upload can stall the same way, so this is reachable
 * without anything being broken.
 *
 * Generous on purpose: a big book full of photos on a slow phone is a real,
 * working save, and cutting one short costs a redundant write and possibly a
 * conflict prompt. The write is not cancelled — if it does land later it still
 * records where it got to (see `saveGenerationRef`). What ends here is the
 * claim that it is still happening.
 */
export const SAVE_TIMEOUT_MS = 45_000;
