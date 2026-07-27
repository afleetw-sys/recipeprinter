import { ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./firebase/storage";
import { getFirebaseAuth } from "./firebase/client";
import { firebaseConfigured } from "./firebase/client";

// When an image import fails — either the browser can't decode it or the parser
// can't find a recipe in it — we stash the exact image bytes that failed so the
// failure is actually reproducible/debuggable, instead of only a PostHog event
// saying "no_recipe" with no way to see what the user saw. Images land in
// Firebase Storage under `debug/failed-imports/<category>/…`, each carrying its
// failure reason etc. as object metadata; the returned path is attached to the
// `recipe_import_failed` event so a failed event links straight to its image.
//
// Everything here is strictly best-effort: a capture problem must never throw
// into, delay meaningfully, or mask the real import failure the user is seeing.

type FailedImageMeta = {
  /** ImportMethod — always "image" today, but kept explicit. */
  source: string;
  /** ImportFailureCode bucket. */
  category: string;
  /** Truncated parser/decode message. */
  reason: string;
};

const CAPTURE_ROOT = "debug/failed-imports";
// A hard cap so a pathological upload can't balloon: skip anything over this.
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
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
  meta: FailedImageMeta,
): Promise<string | null> {
  if (typeof window === "undefined" || !firebaseConfigured() || images.length === 0) return null;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const shortId = Math.random().toString(36).slice(2, 8);
    const folder = `${CAPTURE_ROOT}/${meta.category}/${stamp}_${shortId}`;
    const storage = getFirebaseStorage();
    const email = currentUserEmail();
    const capturedAt = new Date().toISOString();

    const uploads = images.map(async (input, i) => {
      const blob = await toBlob(input);
      if (!blob || blob.size === 0 || blob.size > MAX_CAPTURE_BYTES) return;
      await uploadBytes(ref(storage, `${folder}/${i}.jpg`), blob, {
        contentType: blob.type || "image/jpeg",
        customMetadata: {
          source: meta.source,
          category: meta.category,
          reason: meta.reason.slice(0, 500),
          user: email,
          index: String(i),
          count: String(images.length),
          capturedAt,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
        },
      });
    });

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS));
    const results = await Promise.race([Promise.allSettled(uploads), timeout]);
    // Timed out, or every upload was a no-op/failure — don't claim a path.
    if (results === null || results.every((r) => r.status === "rejected")) return null;
    return folder;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[failedImageCapture] skipped:", err);
    }
    return null;
  }
}
