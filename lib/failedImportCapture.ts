import { ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./firebase/storage";
import { getFirebaseAuth } from "./firebase/client";
import { firebaseConfigured } from "./firebase/client";

// When an import fails — the browser can't decode an image, or the parser can't
// find a recipe in whatever it was handed — we stash the exact input that failed
// so the failure is actually reproducible/debuggable, instead of only a PostHog
// event saying "no_recipe" with no way to see what the user saw. Every source is
// covered: image bytes, a pasted-text payload, or the URL that wouldn't parse.
// Everything lands in Firebase Storage under `debug/failed-imports/<category>/…`,
// each object carrying its failure reason etc. as metadata; the returned path is
// attached to the `recipe_import_failed` event so a failed event links straight
// to its input.
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

const CAPTURE_ROOT = "debug/failed-imports";
// A hard cap so a pathological upload can't balloon: skip anything over this.
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
// Text is tiny next to images, but someone pasting an entire webpage shouldn't
// dump megabytes into the debug bucket. Truncate past this (and flag that we did).
const MAX_TEXT_CAPTURE_CHARS = 200_000;
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

async function toBlob(input: Blob | string): Promise<Blob | null> {
  try {
    if (typeof input !== "string") return input;
    // A `data:` URL — fetch resolves it to a Blob in the browser.
    const res = await fetch(input);
    return await res.blob();
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
      const blob = await toBlob(input);
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
 * Uploads the failed text payload to Firebase Storage — the pasted recipe text,
 * or the URL that wouldn't parse. Returns the folder path (for the analytics
 * event), or null if there was nothing to capture. Same best-effort contract as
 * the image capture: never throws, never blocks the real failure.
 */
export async function captureFailedImportText(
  payload: string,
  meta: FailedCaptureMeta,
): Promise<string | null> {
  if (typeof window === "undefined" || !firebaseConfigured()) return null;
  const text = payload?.trim();
  if (!text) return null;
  try {
    const truncated = text.length > MAX_TEXT_CAPTURE_CHARS;
    const folder = newCaptureFolder(meta.category);
    const storage = getFirebaseStorage();
    const blob = new Blob([truncated ? text.slice(0, MAX_TEXT_CAPTURE_CHARS) : text], {
      type: "text/plain",
    });
    const upload = uploadBytes(ref(storage, `${folder}/payload.txt`), blob, {
      contentType: "text/plain; charset=utf-8",
      customMetadata: captureMetadata(meta, {
        length: String(text.length),
        truncated: String(truncated),
      }),
    });
    return raceCapture(upload, folder);
  } catch (err) {
    warnSkipped(err);
    return null;
  }
}

function warnSkipped(err: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("[failedImportCapture] skipped:", err);
  }
}
