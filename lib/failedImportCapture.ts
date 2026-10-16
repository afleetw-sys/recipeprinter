import { RECIPE_PRINTER_DEBUG_ROOT } from "./firebase/recipePrinterPaths";
import { track } from "@/lib/analytics";

// Firebase is reached through `await import` here, never statically. This
// module is pure failure-path telemetry, but lib/queue.ts imports it eagerly,
// so a static `firebase/storage` + `firebase/client` at the top pulled the SDK
// (app, auth, app-check, storage) into the initial bundle of the homepage and
// every other page that can import a recipe. The Firestore half below was
// already dynamic for exactly this reason; the Storage and Auth halves were
// not. Nothing here runs until an import has already failed, so paying for the
// SDK at that point costs nobody anything.
// Loaded once and shared: every failed import used to re-import all three.
let firebasePartsLoad: ReturnType<typeof loadFirebaseParts> | null = null;
function firebaseParts() {
  firebasePartsLoad ??= loadFirebaseParts();
  return firebasePartsLoad;
}

async function loadFirebaseParts() {
  const [storageSdk, storageAccessor, client] = await Promise.all([
    import("firebase/storage"),
    import("./firebase/storage"),
    import("./firebase/client"),
  ]);
  return {
    ref: storageSdk.ref,
    uploadBytes: storageSdk.uploadBytes,
    getFirebaseStorage: storageAccessor.getFirebaseStorage,
    getFirebaseAuth: client.getFirebaseAuth,
    firebaseConfigured: client.firebaseConfigured,
  };
}

async function isFirebaseConfigured(): Promise<boolean> {
  try {
    return (await firebaseParts()).firebaseConfigured();
  } catch {
    firebasePartsLoad = null;
    return false;
  }
}

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

/* NOTHING HERE EXPIRES, and that is a decision rather than an oversight.
   A `debugInbox` row is a to-do item: it is read by hand and deleted once the
   bug behind it is fixed, so the rows still present are precisely the ones that
   have NOT been dealt with. Putting a clock on that would delete unreviewed
   work and spare only what was already handled. The image bytes in Storage are
   a genuine leak — deleting a row does not remove what its `imagePath` points
   at — and are knowingly left for now. See docs/failed-import-retention.md.

   */

/* Every failed photo import keeps its photos: no category is skipped and there
   is no daily limit. Both existed to save storage, and both meant a cook's
   failed photo was simply not there when someone went to look (2026-10-15). */

// A hard cap so a pathological upload can't balloon: skip anything over this.
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
// A Firestore document is capped at 1 MB, and a debug row that large is
// unreadable anyway. Long enough to hold any recipe someone actually pasted,
// short enough that the collection stays browsable. Truncation is flagged on
// the row rather than being silent.
const MAX_TEXT_CAPTURE_CHARS = 20_000;
function currentUserEmail(getFirebaseAuth: () => { currentUser: { email: string | null } | null }): string {
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
function captureMetadata(
  meta: FailedCaptureMeta,
  userEmail: string,
  extra: Record<string, string> = {},
) {
  return {
    source: meta.source,
    category: meta.category,
    reason: meta.reason.slice(0, 500),
    user: userEmail,
    capturedAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
    ...extra,
  };
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
 * Starts uploading the failed image(s) to Firebase Storage and returns, at
 * once, the folder they are going to, or null when none of them can be
 * uploaded (empty, unreadable as a data URL, or over the size cap).
 *
 * The path is decided BEFORE the upload so the `debugInbox` row never waits on
 * it. A full-size phone photo on a cellular connection can take well over a
 * minute; the row used to wait 15 s, give up on the path, and say there were no
 * photos while they were still landing. The upload now runs as long as it
 * takes, and a refusal is reported (see `reportCaptureFailure`).
 *
 * Accepts original `File`s (decode failures) or compressed data-URL strings
 * (the exact payload sent to the parser on a "no recipe" failure).
 */
export function captureFailedImportImages(
  images: Array<Blob | string>,
  meta: FailedCaptureMeta,
): string | null {
  if (typeof window === "undefined") return null;
  const blobs = images
    .map((input, index) => ({ index, blob: toBlob(input) }))
    .filter((entry): entry is { index: number; blob: Blob } =>
      Boolean(entry.blob && entry.blob.size > 0 && entry.blob.size <= MAX_CAPTURE_BYTES));
  if (blobs.length === 0) return null;
  const folder = newCaptureFolder(meta.category);
  void uploadCapture(folder, blobs, images.length, meta);
  return folder;
}

async function uploadCapture(
  folder: string,
  blobs: Array<{ index: number; blob: Blob }>,
  count: number,
  meta: FailedCaptureMeta,
): Promise<void> {
  try {
    if (!(await isFirebaseConfigured())) return;
    const { ref, uploadBytes, getFirebaseStorage, getFirebaseAuth } = await firebaseParts();
    const storage = getFirebaseStorage();
    const userEmail = currentUserEmail(getFirebaseAuth);
    const results = await Promise.allSettled(
      blobs.map(({ index, blob }) =>
        uploadBytes(ref(storage, `${folder}/${index}.jpg`), blob, {
          contentType: blob.type || "image/jpeg",
          customMetadata: captureMetadata(meta, userEmail, { index: String(index), count: String(count) }),
        }),
      ),
    );
    const rejected = results.find((r) => r.status === "rejected");
    if (rejected) reportCaptureFailure("upload", meta, rejected.reason);
  } catch (err) {
    reportCaptureFailure("upload", meta, err);
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
  if (typeof window === "undefined") return false;
  if (!(await isFirebaseConfigured())) return false;
  try {
    const [{ addDoc, collection, serverTimestamp }, { getDb }, { getFirebaseAuth }] =
      await Promise.all([
        import("firebase/firestore"),
        import("./firebase/db"),
        import("./firebase/client"),
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
      user: currentUserEmail(getFirebaseAuth),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
      createdAt: serverTimestamp(),
      // No `expiresAt`. It was briefly written here to drive a Firestore TTL
      // policy, which was the wrong idea for a collection that is worked
      // through by hand — and a field promising an expiry that nothing
      // enforces is worse than no field, because the person reading these rows
      // would reasonably believe it. `firestore.rules` still tolerates one, so
      // a future backstop needs no rules deploy ahead of it.
    });
    return true;
  } catch (err) {
    reportCaptureFailure("inbox", meta, err);
    return false;
  }
}

/** A refused capture (App Check, rules, quota) used to look exactly like no
    failure at all in production. This is the one place it shows up. */
function reportCaptureFailure(stage: "upload" | "inbox", meta: FailedCaptureMeta, err: unknown): void {
  warnSkipped(err);
  const code = (err as { code?: unknown } | null)?.code;
  track("failed_import_capture_failed", {
    stage,
    source: meta.source,
    category: meta.category,
    errorCode: typeof code === "string" ? code.slice(0, 80) : "unknown",
  });
}

function warnSkipped(err: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("[failedImportCapture] skipped:", err);
  }
}
