"use client";

// Downscales an uploaded cover/chapter photo to a compressed JPEG data URL
// before it's stored on the project. A full-resolution phone photo as a data
// URL would bloat sessionStorage and the saved Firestore doc, so it's capped on
// the long edge and re-encoded — the same approach ImportPanel uses for recipe
// images, kept separate here so the cover picker doesn't pull in the import
// pipeline (HEIC transcode, multi-file handling) it doesn't need.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
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

// Downscales `file` onto a canvas capped at MAX_DIMENSION on its long edge —
// the shared step behind both the data-URL and Blob encoders below.
async function fileToScaledCanvas(file: File): Promise<HTMLCanvasElement> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export async function fileToCoverDataUrl(file: File): Promise<string> {
  const canvas = await fileToScaledCanvas(file);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Same downscale as `fileToCoverDataUrl`, but returns a compressed JPEG Blob —
    used when the image is going straight to Firebase Storage (uploadBytes wants
    bytes, not a data URL, and this avoids a base64 round-trip). */
export async function fileToCoverBlob(file: File): Promise<Blob> {
  const canvas = await fileToScaledCanvas(file);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
