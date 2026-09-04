"use client";

import { loadImageWithHeicFallback } from "@/lib/heicTranscode";

// Downscales and re-encodes a photo before it's stored on the project.
//
// Every photo that reaches a printed book passes through here. That matters
// more than it looks: the PDF renderer embeds each photo's ORIGINAL JPEG bytes
// straight through (see docs/cookbook-pdf-export.md), so a book's file size is
// about the sum of its photos, and a full-resolution phone photo also bloats
// sessionStorage and the saved Firestore doc on its way there.
//
// Kept separate from the import pipeline (HEIC transcode, multi-file handling)
// so the cover picker doesn't pull in machinery it doesn't need. Note that
// `lib/imageImport.ts` has its own, unrelated 2048px cap — that one sizes
// images for the vision PARSER, where the constraint is text legibility and a
// payload ceiling, not print.

/**
 * Long-edge ceiling, in pixels, for any photo that reaches a book.
 *
 * Sized from the page rather than picked round: the widest sheet a cookbook
 * prints on is 8.5in (the spiral preset's trim), and 2560 / 8.5in = 301dpi —
 * so a photo spanning the full width of a page still lands at the 300dpi print
 * standard. Down the 11in axis of a full-bleed page the same photo is ~233dpi,
 * which is within the normal range for photo printing.
 *
 * This was 1600, which is ~188dpi across that 8.5in page and ~145dpi down it —
 * below print standard, and the reason a photo imported at full resolution
 * currently prints BETTER than one added through the picker. One number
 * controls every path; lower it to trade print quality for download size.
 */
export const PHOTO_MAX_DIMENSION = 2560;
const JPEG_QUALITY = 0.82;

/**
 * The target box for a `width` x `height` image capped at `max` on its long
 * edge. Never upscales — a photo smaller than the cap is left alone.
 *
 * Pure, and exported, because it is the whole sizing rule and the rest of this
 * file is canvas work that the Node test environment cannot run.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number = PHOTO_MAX_DIMENSION,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  const scale = longest > 0 ? Math.min(1, max / longest) : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: scale < 1,
  };
}

// Draws `source` onto a canvas capped at PHOTO_MAX_DIMENSION on its long edge —
// the shared step behind both encoders below. Takes a Blob, not a File, so the
// save/export sweep can hand it bytes it fetched from a `data:`/`blob:` URL.
async function blobToScaledCanvas(source: Blob): Promise<HTMLCanvasElement> {
  // Transcodes HEIC when the browser cannot draw it, which is every browser but
  // Safari. This path used to go straight to `new Image()`, so an iPhone photo
  // picked for a cover, a chapter or a recipe failed outright — and
  // `friendlyPhotoUploadError` turned that into "try a JPG or PNG", which read
  // as us refusing the format rather than never having supported it. The
  // recipe importer has handled HEIC for a long time; this is the same chain.
  const { image } = await loadImageWithHeicFallback(source);
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

async function encodeScaledJpeg(source: Blob): Promise<Blob> {
  const canvas = await blobToScaledCanvas(source);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export async function fileToCoverDataUrl(file: File): Promise<string> {
  const canvas = await blobToScaledCanvas(file);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Same downscale as `fileToCoverDataUrl`, but returns a compressed JPEG Blob —
    used when the image is going straight to Firebase Storage (uploadBytes wants
    bytes, not a data URL, and this avoids a base64 round-trip).

    Throws if the image can't be decoded or encoded: this is the picker, where
    someone is watching, and a photo that silently didn't arrive is worse than
    an error that says so. The sweep's tolerant counterpart is
    `normalizePhotoBlob`. */
export async function fileToCoverBlob(file: File): Promise<Blob> {
  return encodeScaledJpeg(file);
}

/**
 * Best-effort version of the same normalization, for photos already on a
 * project that are being swept into Storage (a Paprika import's embedded
 * base64, a blob URL) rather than picked by hand.
 *
 * Never throws and never makes a photo worse:
 *
 *  - an image this browser can't decode (an odd HEIC, a corrupt file) uploads
 *    unchanged, because losing the photo entirely to save bytes is not a trade
 *    anyone asked for;
 *  - a result that came out LARGER than the original is discarded. Re-encoding
 *    an already-optimized JPEG, or anything with few enough colors that PNG
 *    beats JPEG, can do that — and it would also flatten a transparent PNG onto
 *    black on the way. Keeping the smaller of the two makes both cases a no-op.
 */
export async function normalizePhotoBlob(source: Blob): Promise<Blob> {
  try {
    const normalized = await encodeScaledJpeg(source);
    return normalized.size > 0 && normalized.size < source.size ? normalized : source;
  } catch {
    return source;
  }
}
