// ─────────────────────────────────────────────────────────────────────────────
// Client-side image import helpers: HEIC transcode, downscale/compress to a JPEG
// data-URL (off the main thread via createImageBitmap + OffscreenCanvas where
// supported, main-thread <canvas> otherwise), and the file validation/partition
// rules. Extracted from ImportPanel so both the full workspace importer and the
// minimal SEO capture block share one implementation (and one HEIC/compression
// code path).
//
// Browser-only (uses Image/canvas/FileReader) — call from client components.
// ─────────────────────────────────────────────────────────────────────────────

import { ImportError } from "@/lib/parser";
import type { ImportFailureCode } from "@/lib/analytics";

const MAX_IMAGE_FILES = 4;
const MAX_IMAGE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 3_500_000;
const MAX_IMAGE_DATA_URL_TOTAL_CHARS = 8_500_000;
// A cookbook page or handwritten card is mostly small body text, and the parser
// reads it with a vision model — downscale too hard and legible print turns to
// mush, so a genuine recipe comes back as "no recipe". 2048px on the long edge
// keeps that text readable while staying well under the callable's payload
// ceiling (guarded by the char caps above). HEIC is transcoded to JPEG first
// (see loadDecodableImage), so every image that reaches the canvas is drawable.
const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 0.82;

function readImageAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read image"));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image"));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load image"));
    };
    image.src = url;
  });
}

// ── HEIC transcode ───────────────────────────────────────────────────────────
// heic2any wraps a ~1.5 MB libheif wasm build, so it's dynamically imported and
// only pulled down when a file actually needs transcoding.
//
// It also decodes exactly ONCE per page. The library builds a single worker at
// import time and parks it on `window.__heic2any__worker`; every call posts to
// that one worker, and libheif inside it does not survive a decode. Measured in
// Chrome against a real HEIC: the first photo converts, the second comes back
// "ERR_LIBHEIF format not supported", and the third aborts the wasm module
// outright — after which every HEIC on the page fails, including any that would
// have worked. Two at once (which is what importing several photos does) abort
// each other on the first try.
//
// So each transcode gets a CLEAN worker, and they run one at a time, because
// there is only the one slot for the library to read. The worker's script is a
// blob heic2any builds while it initializes; we note its URL as it goes past so
// a fresh worker is one `new Worker` rather than re-parsing 1.3 MB of bundle.

type HeicConvert = (options: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

interface HeicWorkerHost {
  __heic2any__worker?: Worker;
}

/** Mutable so the capture below can fill it in AFTER the import resolves — see
    `loadHeicLibrary`. Read at transcode time, not at load time. */
interface HeicWorkerScript {
  url: string | null;
}

let heicLibrary: Promise<{ convert: HeicConvert; script: HeicWorkerScript }> | null = null;

function loadHeicLibrary() {
  heicLibrary ??= (async () => {
    const script: HeicWorkerScript = { url: null };
    const createObjectURL = URL.createObjectURL.bind(URL);
    // Nothing else in this pipeline ever makes a JavaScript object URL — the
    // rest are image blobs — so this identifies the worker script without
    // reaching into the library's internals for it.
    //
    // Matches any `*/javascript` type, not `application/javascript` alone.
    // heic2any builds its worker blob as `text/javascript`, so the exact match
    // this used to do never once fired, and `url` was always null. Combined
    // with the `finally` in `heicToJpegBlob` — which terminated the worker it
    // could then never rebuild — that made every HEIC after the FIRST one fail
    // for the whole page session, with a bare "postMessage of undefined".
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = createObjectURL(object as Blob);
      if (!script.url && object instanceof Blob && /\bjavascript\b/i.test(object.type)) {
        script.url = url;
        // Captured; stop intercepting. This is why the patch is NOT lifted when
        // the import resolves: heic2any builds the worker lazily on the first
        // convert, not during module init, so a patch scoped to the import
        // would be gone before the URL it is watching for ever goes past.
        URL.createObjectURL = createObjectURL;
      }
      return url;
    };
    try {
      const { default: convert } = await import("heic2any");
      return { convert: convert as HeicConvert, script };
    } catch (error) {
      // The import failed, so nothing will ever come past the patch to remove
      // it. Put the real one back rather than leaving the whole page with an
      // intercepted `createObjectURL`.
      URL.createObjectURL = createObjectURL;
      heicLibrary = null;
      throw error;
    }
  })();
  return heicLibrary;
}

/** Tail of the transcode chain — one HEIC through libheif at a time. */
let heicChain: Promise<unknown> = Promise.resolve();

/**
 * Second-chance decoder, for a HEIC `heic2any` cannot read at all.
 *
 * heic2any is pinned at 0.0.4 and unpublished since; the libheif inside it
 * predates Apple's **Adaptive HDR**, where the primary image item is no longer
 * a plain HEVC frame but a `tmap` derived from a base image plus a gain map
 * (ftyp brands `MiHA heix MiHE MiPr … tmap`; iPhone 16 / iOS 26, and the
 * default for every new iPhone). It can't find a decodable primary item and
 * answers `ERR_LIBHEIF format not supported`, so the photo looked broken when
 * it was fine — macOS opens the same file without complaint.
 *
 * A current libheif reads it. This one is imported ONLY after heic2any has
 * already failed, so the 1.4MB wasm bundle is downloaded by the people whose
 * photos need it and nobody else, and the ordinary-HEIC path keeps heic2any's
 * off-thread worker.
 *
 * The cost of that ordering: this decode runs on the main thread. It is ~600ms
 * for a 12MP photo, it is serialized behind `heicChain` with everything else,
 * and it only happens for files that would otherwise have been rejected — a
 * trade worth making, but the reason this is the fallback and not the default.
 */
let libheifModule: Promise<typeof import("libheif-js/wasm-bundle").default extends Promise<infer T> ? T : never> | null = null;

async function loadLibheif() {
  libheifModule ??= import("libheif-js/wasm-bundle")
    .then((mod) => mod.default)
    .catch((error) => {
      // Let a later photo try again rather than caching the failure forever.
      libheifModule = null;
      throw error;
    });
  return libheifModule;
}

async function libheifToJpegBlob(file: File): Promise<Blob> {
  const libheif = await loadLibheif();
  const images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  // An Adaptive HDR file holds several items (the base image, the gain map, the
  // tone-mapped result). `[0]` is the primary one, which is what the camera
  // intends you to see.
  const image = images?.[0];
  if (!image) throw new Error("That HEIC file has no image inside it.");

  const width = image.get_width();
  const height = image.get_height();
  const rendered = await new Promise<{ data: Uint8ClampedArray<ArrayBuffer> }>((resolve, reject) => {
    image.display({ data: new Uint8ClampedArray(new ArrayBuffer(width * height * 4)), width, height }, (result) =>
      result ? resolve(result) : reject(new Error("That HEIC file could not be rendered.")),
    );
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.putImageData(new ImageData(rendered.data, width, height), 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      IMAGE_JPEG_QUALITY,
    );
  });
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  const run = heicChain.then(async () => {
    const { convert, script } = await loadHeicLibrary();
    const host = globalThis as unknown as HeicWorkerHost;
    // No URL means either the library changed shape under us, or this is the
    // very first transcode and the worker script has not been built yet.
    // Convert on whatever worker heic2any makes for itself rather than failing
    // outright — and, crucially, leave it alone afterwards (see the `finally`).
    if (script.url) {
      host.__heic2any__worker?.terminate();
      host.__heic2any__worker = new Worker(script.url);
    }
    try {
      const converted = await convert({
        blob: file,
        toType: "image/jpeg",
        quality: IMAGE_JPEG_QUALITY,
      });
      return Array.isArray(converted) ? converted[0] : converted;
    } catch (err) {
      // heic2any could not read it. Before giving up, hand the file to a
      // current libheif — this is the Adaptive HDR case, and it is the whole
      // reason that fallback exists. Only if THAT fails too is the photo
      // genuinely unreadable here.
      try {
        return await libheifToJpegBlob(file);
      } catch (fallbackErr) {
        // Report the fallback's reason, not heic2any's: heic2any's
        // `ERR_LIBHEIF format not supported` describes a decoder that is four
        // years stale, which tells nobody anything about their photo.
        //
        // heic2any also rejects with a bare `{ code, message }`, which every
        // `instanceof Error` check upstream reads as "unknown" — including the
        // one that fills in why an import failed. Give it something that answers.
        throw new Error(
          fallbackErr instanceof Error ? fallbackErr.message : heicFailureMessage(err),
        );
      }
    } finally {
      // Nothing more will come out of this one, and it is holding the wasm heap
      // — but only tear it down if we can build the replacement. heic2any reads
      // its worker off this exact global on every convert, so destroying one we
      // cannot recreate doesn't just skip the memory saving, it breaks every
      // later transcode in the page with "postMessage of undefined". That was a
      // silent first-photo-only failure for anyone importing HEIC.
      if (script.url) {
        host.__heic2any__worker?.terminate();
        delete host.__heic2any__worker;
      }
    }
  });
  // The next transcode waits for this one either way; it must not inherit the
  // rejection, which would fail every later photo for the first one's reason.
  heicChain = run.catch(() => undefined);
  return run;
}

function heicFailureMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "HEIC transcode failed";
}

// Safari can draw HEIC to a canvas natively; Chrome/Firefox/Android can't. So try
// the native decode first (free, works for every normal JPG/PNG and for HEIC on
// Apple devices) and only fall back to the wasm transcode when a HEIC file fails
// that path. Non-HEIC decode failures propagate untouched so the batch's
// allSettled can skip just that file. (heic2any runs libheif in its own internal
// worker, so that transcode is already off the main thread — see the OffscreenCanvas
// note below for what this pipeline moves off-thread on top of that.)
async function loadDecodableImage(file: File): Promise<{ image: HTMLImageElement; source: Blob }> {
  try {
    return { image: await loadImageFromBlob(file), source: file };
  } catch (err) {
    if (!isHeic(file)) throw err;
    const jpeg = await heicToJpegBlob(file);
    return { image: await loadImageFromBlob(jpeg), source: jpeg };
  }
}

// The createImageBitmap analogue of loadDecodableImage: decode off the main
// thread. Same HEIC fallback — native decode first, wasm transcode only when a
// HEIC file the browser can't decode fails.
async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch (err) {
    if (!isHeic(file)) throw err;
    const jpeg = await heicToJpegBlob(file);
    return await createImageBitmap(jpeg);
  }
}

// Whether we can keep the decode/resize/encode off the main thread. `toDataURL`
// on a regular <canvas> both encodes JPEG and drops it on the main thread; the
// createImageBitmap (off-thread decode) + OffscreenCanvas.convertToBlob
// (off-thread encode) path avoids that jank. Safari gained convertToBlob in 17,
// so older browsers fall through to the main-thread canvas path below.
const canOffscreenCompress =
  typeof createImageBitmap === "function" &&
  typeof OffscreenCanvas === "function" &&
  typeof OffscreenCanvas.prototype.convertToBlob === "function";

async function compressViaOffscreen(file: File): Promise<string> {
  const bitmap = await decodeToBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no-2d-context");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: IMAGE_JPEG_QUALITY });
    return await readImageAsDataURL(blob);
  } finally {
    bitmap.close();
  }
}

async function compressViaCanvas(file: File): Promise<string> {
  const { image, source } = await loadDecodableImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return readImageAsDataURL(source);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
}

export async function imageAsCompressedDataURL(file: File): Promise<string> {
  if (canOffscreenCompress) {
    try {
      return await compressViaOffscreen(file);
    } catch (err) {
      // A HEIC file with no browser decoder AND no transcode still can't be
      // read either way, so let that surface. Anything else (an OffscreenCanvas
      // quirk on an otherwise-decodable file) retries on the main-thread path.
      if (isHeic(file)) throw err;
    }
  }
  return compressViaCanvas(file);
}

// HEIC/HEIF is the iPhone camera default. Only Safari can draw it to a <canvas>;
// elsewhere we transcode it to JPEG first (loadDecodableImage), and this
// predicate is how both paths recognise it — by MIME type, or by extension when
// the picker hands it over with an empty type.
const HEIC_RE = /\.(heic|heif)$/i;

export function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_RE.test(file.name);
}

/**
 * Splits a raw picker/drop selection into image candidates and a count of
 * everything clearly-not-an-image. MIME type is a hint, not a gate: plenty of
 * real photos arrive with an *empty* `file.type` (mobile share sheets,
 * extension-less files, some cloud pickers), and dropping those silently is what
 * leaves the user staring at "Choose at least one photo" after they definitely
 * chose one. So anything with no type, or an `image/*` type, is kept and left for
 * the canvas decoder to accept or reject; only a file that declares a non-image
 * type is turned away. HEIC stays in `images` because we can transcode it.
 */
export function partitionImageFiles(list: FileList | null): { images: File[]; rejected: number } {
  const all = Array.from(list ?? []);
  const images = all.filter((f) => !f.type || f.type.startsWith("image/") || isHeic(f));
  return { images, rejected: all.length - images.length };
}

export function imageLabel(files: File[]): string {
  if (files.length === 0) return "Choose or drop photos";
  if (files.length === 1) return files[0].name;
  return `${files.length} photos selected`;
}

export type ImageValidationError = { message: string; category: ImportFailureCode };

export function validateImageFiles(files: File[]): ImageValidationError | null {
  if (files.length > MAX_IMAGE_FILES) {
    return { message: `Choose up to ${MAX_IMAGE_FILES} photos at a time.`, category: "too_large" };
  }
  // Cloud pickers (iCloud, Drive) can hand back a 0-byte placeholder for a file
  // that hasn't finished downloading. It would pass every size check and only die
  // at decode — catch it here with something the user can act on.
  if (files.some((file) => file.size === 0)) {
    return {
      message: "That photo hasn't finished downloading to this device yet. Save it locally, then choose it again.",
      category: "decode_failed",
    };
  }
  const oversized = files.find((file) => file.size > MAX_IMAGE_FILE_BYTES);
  if (oversized) {
    return { message: `${oversized.name} is too large. Choose photos under 12 MB.`, category: "too_large" };
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_IMAGE_TOTAL_BYTES) {
    return { message: "Those photos are too large together. Choose fewer or smaller images.", category: "too_large" };
  }
  return null;
}

export async function prepareImageDataUrls(files: File[]): Promise<string[]> {
  // One unreadable file shouldn't sink the whole batch — compress them
  // independently and keep whatever decoded.
  const settled = await Promise.allSettled(files.map(imageAsCompressedDataURL));
  const dataUrls = settled
    .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
    .map((result) => result.value);

  if (dataUrls.length === 0) {
    throw new ImportError(
      "We couldn't read those images. Try different files, or a JPG or PNG screenshot.",
      "decode_failed",
    );
  }

  const oversized = dataUrls.some((dataUrl) => dataUrl.length > MAX_IMAGE_DATA_URL_CHARS);
  const totalChars = dataUrls.reduce((total, dataUrl) => total + dataUrl.length, 0);
  if (oversized || totalChars > MAX_IMAGE_DATA_URL_TOTAL_CHARS) {
    throw new ImportError("Those photos are still too large after resizing. Try fewer or smaller images.", "too_large");
  }
  return dataUrls;
}
