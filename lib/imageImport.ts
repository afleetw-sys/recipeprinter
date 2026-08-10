// ─────────────────────────────────────────────────────────────────────────────
// Client-side image import helpers: HEIC transcode, canvas downscale/compress to
// a JPEG data-URL, and the file validation/partition rules. Extracted from
// ImportPanel so both the full workspace importer and the minimal SEO capture
// block share one implementation (and one HEIC/compression code path).
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

// heic2any wraps a ~1.5 MB libheif wasm build, so it's dynamically imported and
// only pulled down when a file actually needs transcoding.
async function heicToJpegBlob(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: IMAGE_JPEG_QUALITY });
  return Array.isArray(converted) ? converted[0] : converted;
}

// Safari can draw HEIC to a canvas natively; Chrome/Firefox/Android can't. So try
// the native decode first (free, works for every normal JPG/PNG and for HEIC on
// Apple devices) and only fall back to the wasm transcode when a HEIC file fails
// that path. Non-HEIC decode failures propagate untouched so the batch's
// allSettled can skip just that file.
async function loadDecodableImage(file: File): Promise<{ image: HTMLImageElement; source: Blob }> {
  try {
    return { image: await loadImageFromBlob(file), source: file };
  } catch (err) {
    if (!isHeic(file)) throw err;
    const jpeg = await heicToJpegBlob(file);
    return { image: await loadImageFromBlob(jpeg), source: jpeg };
  }
}

export async function imageAsCompressedDataURL(file: File): Promise<string> {
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
