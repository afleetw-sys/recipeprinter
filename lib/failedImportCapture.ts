import { ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./firebase/storage";
import { getFirebaseAuth } from "./firebase/client";
import { firebaseConfigured } from "./firebase/client";
import { RECIPE_PRINTER_DEBUG_ROOT } from "./firebase/recipePrinterPaths";

// When an import fails — the browser can't decode an image, or the parser can't
// find a recipe in whatever it was handed — we keep the exact input that failed,
// so the failure is reproducible instead of being a PostHog event saying
// "no_recipe" with no way to see what the user saw.
//
// TWO PLACES, on purpose:
//
//   Firestore `debugInbox` gets a row for EVERY failure, whatever the source.
//   It is the thing you actually read: one document per failure, sortable by
//   time, filterable by category, with the URL or the pasted text right there
//   in the field. A folder of files in Storage is not a list you can query.
//
//   Storage `recipeprinter/debug/failed-imports/<category>/…` gets IMAGE BYTES
//   only, because bytes are the one thing a Firestore document cannot hold.
//   The row in `debugInbox` carries the folder path, so a failure links to its
//   photographs.
//
// Text and URLs no longer go to Storage at all. They were being written as
// `payload.txt` files nobody could browse, next to a Firestore collection that
// was the obvious place to look and was empty.
//
// Everything here is strictly best-effort: a capture problem must never throw
// into, delay meaningfully, or mask the real import failure the user is seeing.

type FailedCaptureMeta = {
  /** ImportMethod — "image", "text", "url". */
  source: string;
  /** ImportFailureCode bucket. */
  category: string;
  /** Truncated parser/decode message. */
  reason: string;
};

const CAPTURE_ROOT = RECIPE_PRINTER_DEBUG_ROOT;
/** Shared with CookPilot; every row here carries `product` to tell them apart. */
const DEBUG_INBOX_COLLECTION = "debugInbox";
// A hard cap so a pathological upload can't balloon: skip anything over this.
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
// A Firestore document is capped at 1 MB, and a debug row that large is
// unreadable anyway. Long enough to hold any recipe someone actually pasted,
// short enough that the collection stays browsable. Truncation is flagged on
// the row rather than being silent.
const MAX_TEXT_CAPTURE_CHARS = 20_000;
// The caller awaits this only to attach the path to the failure event, so it
// must not hang that event on a slow upload. If capture outruns this, the
// uploads still finish in the background — we just don't report the path.
const CAPTURE_TIMEOUT_MS = 15000;

function currentUserEmail(): string {
  try {
    return getFirebaseAuth().currentUser?.email ?? "";
  } catch {
    return "";
  }
}

/** A fresh, collision-resistant folder for one failed import, bucketed by category. */
function newCaptureFolder(category: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shortId = Math.random().toString(36).slice(2, 8);
  return `${CAPTURE_ROOT}/${category}/${stamp}_${shortId}`;
}

/** The object metadata every capture shares, plus any per-call extras. */
function captureMetadata(meta: FailedCaptureMeta, extra: Record<string, string> = {}) {
  return {
    source: meta.source,
    category: meta.category,
    reason: meta.reason.slice(0, 500),
    user: currentUserEmail(),
    capturedAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
    ...extra,
  };
}

/** Resolves to `folder` if the upload landed before the timeout, else null. */
async function raceCapture(work: Promise<unknown>, folder: string): Promise<string | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS));
  return Promise.race([work.then(() => folder).catch(() => null), timeout]);
}

// Decode a `data:` URL to a Blob locally, rather than `fetch`-ing it back —
// the bytes are already in memory (this is the exact compressed payload the
// parser was handed), so a fetch round-trip just re-parses base64 we hold.
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) return null;
  const header = dataUrl.slice(5, comma);
  const mime = header.split(";")[0] || "application/octet-stream";
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(header)) {
    return new Blob([decodeURIComponent(body)], { type: mime });
  }
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function toBlob(input: Blob | string): Blob | null {
  if (typeof input !== "string") return input;
  try {
    return dataUrlToBlob(input);
  } catch {
    return null;
  }
}

/**
 * Uploads the failed image(s) to Firebase Storage. Returns the folder path they
 * were written to (for the analytics event), or null if nothing was captured.
 * Accepts original `File`s (decode failures) or compressed data-URL strings
 * (the exact payload sent to the parser on a "no recipe" failure).
 */
export async function captureFailedImportImages(
  images: Array<Blob | string>,
  meta: FailedCaptureMeta,
): Promise<string | null> {
  if (typeof window === "undefined" || !firebaseConfigured() || images.length === 0) return null;
  try {
    const folder = newCaptureFolder(meta.category);
    const storage = getFirebaseStorage();

    const uploads = images.map(async (input, i) => {
      const blob = toBlob(input);
      if (!blob || blob.size === 0 || blob.size > MAX_CAPTURE_BYTES) return;
      await uploadBytes(ref(storage, `${folder}/${i}.jpg`), blob, {
        contentType: blob.type || "image/jpeg",
        customMetadata: captureMetadata(meta, {
          index: String(i),
          count: String(images.length),
        }),
      });
    });

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS));
    const results = await Promise.race([Promise.allSettled(uploads), timeout]);
    // Timed out, or every upload was a no-op/failure — don't claim a path.
    if (results === null || results.every((r) => r.status === "rejected")) return null;
    return folder;
  } catch (err) {
    warnSkipped(err);
    return null;
  }
}

/**
 * Writes one row to Firestore `debugInbox` for a failed import.
 *
 * This is the record you read. Every failure gets one, whatever the source:
 * the URL that would not parse, the text that was pasted, or a note that the
 * bytes are in Storage at `imagePath`.
 *
 * Best-effort like everything else here — it is awaited only so the caller can
 * report success, and a rejection is swallowed rather than surfaced to a cook
 * who is already looking at a failed import.
 */
export async function recordFailedImport(
  meta: FailedCaptureMeta,
  detail: { payload?: string; imagePath?: string | null; imageCount?: number } = {},
): Promise<boolean> {
  if (typeof window === "undefined" || !firebaseConfigured()) return false;
  try {
    const [{ addDoc, collection, serverTimestamp }, { getDb }] = await Promise.all([
      import("firebase/firestore"),
      import("./firebase/db"),
    ]);
    const raw = detail.payload?.trim() ?? "";
    const truncated = raw.length > MAX_TEXT_CAPTURE_CHARS;
    await addDoc(collection(getDb(), DEBUG_INBOX_COLLECTION), {
      // Two products share this collection and this Firestore. Without it a
      // RecipePrinter failure is indistinguishable from a CookPilot one.
      product: "recipeprinter",
      source: meta.source,
      category: meta.category,
      reason: meta.reason.slice(0, 500),
      payload: truncated ? raw.slice(0, MAX_TEXT_CAPTURE_CHARS) : raw,
      payloadTruncated: truncated,
      payloadLength: raw.length,
      // Where the bytes are, for an image failure. Null for everything else.
      imagePath: detail.imagePath ?? null,
      imageCount: detail.imageCount ?? 0,
      user: currentUserEmail(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    warnSkipped(err);
    return false;
  }
}

function warnSkipped(err: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("[failedImportCapture] skipped:", err);
  }
}
