import { RECIPE_PRINTER_DEBUG_ROOT } from "./firebase/recipePrinterPaths";
import { localStore } from "@/lib/storage";

// Firebase is reached through `await import` here, never statically. This
// module is pure failure-path telemetry, but lib/queue.ts imports it eagerly,
// so a static `firebase/storage` + `firebase/client` at the top pulled the SDK
// (app, auth, app-check, storage) into the initial bundle of the homepage and
// every other page that can import a recipe. The Firestore half below was
// already dynamic for exactly this reason; the Storage and Auth halves were
// not. Nothing here runs until an import has already failed, so paying for the
// SDK at that point costs nobody anything.
async function firebaseParts() {
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
  };
}

async function isFirebaseConfigured(): Promise<boolean> {
  try {
    return (await import("./firebase/client")).firebaseConfigured();
  } catch {
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

   What this module does instead is write less: the two gates below cut what is
   uploaded at all, without reducing what any failure can tell you. */

/**
 * Failures where the photographs cannot answer the question.
 *
 * The bytes are kept so a failure can be REPRODUCED, and that only means
 * anything when the failure was about the photographs. These three are not:
 * the parser was rate-limited, unreachable, or too slow, and the picture the
 * cook chose had nothing to do with it. Uploading several megabytes to learn
 * "the backend was down" is paying storage rent on an answer we already have.
 *
 * The Firestore row is still written for every one of them. The event is never
 * lost — only the bytes that could not have explained it.
 */
const BYTES_EXPLAIN_NOTHING = new Set(["rate_limited", "backend_unavailable", "timeout"]);

/** Whether a failure in this bucket is one the photographs could explain.
    Exported because it is policy about what we spend storage on, not a detail
    of how the upload is performed. */
export function imageBytesWorthKeeping(category: string): boolean {
  return !BYTES_EXPLAIN_NOTHING.has(category);
}

/**
 * How many photo captures one browser may upload per day.
 *
 * Not a sample: the first few of anything are kept in full, and the row always
 * is. What this stops is the same failure being uploaded over and over, which
 * is a real shape rather than a hypothetical one — a photo the browser cannot
 * decode fails identically every time it is picked, and the honest response to
 * a failed import is to try it again. A cook working through one bad photo
 * could file it a dozen times before giving up, and the twelfth copy of the
 * same bytes has never taught anyone anything.
 *
 * Deliberately generous enough to cover a genuinely bad afternoon — several
 * different photos each failing once is exactly the case worth having whole.
 */
const MAX_IMAGE_CAPTURES_PER_DAY = 6;
const CAPTURE_BUDGET_KEY = "recipeprinter:debug-capture-budget:v1";
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

function currentUserEmail(getFirebaseAuth: () => { currentUser: { email: string | null } | null }): string {
  try {
    return getFirebaseAuth().currentUser?.email ?? "";
  } catch {
    return "";
  }
}

/**
 * Whether this browser may upload photographs for another capture today, and
 * if so, spends one from the day's budget.
 *
 * Best-effort like everything else here: a browser whose storage cannot be read
 * gets the benefit of the doubt and captures, because losing a real diagnostic
 * to an unreadable counter is the worse of the two mistakes.
 */
export function claimImageCaptureBudget(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  let spent = 0;
  try {
    const budget = localStore.getJson<{ day?: string; count?: number }>(CAPTURE_BUDGET_KEY);
    if (budget?.day === today && typeof budget.count === "number") spent = budget.count;
  } catch {
    return true;
  }
  if (spent >= MAX_IMAGE_CAPTURES_PER_DAY) return false;
  localStore.setJson(CAPTURE_BUDGET_KEY, { day: today, count: spent + 1 });
  return true;
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
 * Uploads the failed image(s) to Firebase Storage. Returns the folder path they
 * were written to (for the analytics event), or null if nothing was captured.
 * Accepts original `File`s (decode failures) or compressed data-URL strings
 * (the exact payload sent to the parser on a "no recipe" failure).
 */
export async function captureFailedImportImages(
  images: Array<Blob | string>,
  meta: FailedCaptureMeta,
): Promise<string | null> {
  if (typeof window === "undefined" || images.length === 0) return null;
  // Cheapest gates first, and both BEFORE Firebase is even loaded: neither
  // needs to know anything except the category and a counter, and a capture
  // that is not going to happen should not pull the Storage SDK to find out.
  if (!imageBytesWorthKeeping(meta.category)) return null;
  if (!claimImageCaptureBudget()) return null;
  if (!(await isFirebaseConfigured())) return null;
  try {
    const { ref, uploadBytes, getFirebaseStorage, getFirebaseAuth } = await firebaseParts();
    const folder = newCaptureFolder(meta.category);
    const storage = getFirebaseStorage();
    const userEmail = currentUserEmail(getFirebaseAuth);

    const uploads = images.map(async (input, i) => {
      const blob = toBlob(input);
      if (!blob || blob.size === 0 || blob.size > MAX_CAPTURE_BYTES) return;
      await uploadBytes(ref(storage, `${folder}/${i}.jpg`), blob, {
        contentType: blob.type || "image/jpeg",
        customMetadata: captureMetadata(meta, userEmail, {
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
