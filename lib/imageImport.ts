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
import { heicToJpegBlob, isHeic } from "@/lib/heicTranscode";

export { isHeic };

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
