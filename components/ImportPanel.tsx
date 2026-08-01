"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import type { ImportMethod } from "@/types/recipe";
import type { QueueItem } from "@/types/recipe";
import { track, truncateReason, type ImportFailureCode } from "@/lib/analytics";
import { ImportError } from "@/lib/parser";
import { captureFailedImportImages } from "@/lib/failedImportCapture";
import {
  CookPilotLogoIcon,
  ImageIcon,
  LinkIcon,
  MoreVerticalIcon,
  PlusIcon,
  TextIcon,
  UploadIcon,
} from "@/components/icons";

// Compact import switch: URL and CookPilot are first-class; lower-frequency
// sources live behind an overflow menu so the workspace rail stays quiet.

const MODES: {
  id: ImportMethod;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "url", label: "URL", icon: LinkIcon },
  { id: "cookpilot", label: "CookPilot", icon: CookPilotLogoIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "text", label: "Paste Text", icon: TextIcon },
];

const PRIMARY_MODES = MODES.filter((mode) => mode.id === "url" || mode.id === "cookpilot");
const OVERFLOW_MODES = MODES.filter((mode) => mode.id === "image" || mode.id === "text");

const CookPilotImportSource = dynamic(
  () => import("@/components/CookPilotRecipePicker").then((mod) => mod.CookPilotImportSource),
  {
    ssr: false,
    loading: () => null,
  },
);

const MAX_IMAGE_FILES = 4;
const MAX_IMAGE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 3_500_000;
const MAX_IMAGE_DATA_URL_TOTAL_CHARS = 8_500_000;
// A cookbook page or handwritten card is mostly small body text, and the
// parser reads it with a vision model — downscale too hard and legible print
// turns to mush, so a genuine recipe comes back as "no recipe". 2048px on the
// long edge keeps that text readable while staying well under the callable's
// payload ceiling (guarded by the char caps above). HEIC is transcoded to JPEG
// first (see loadDecodableImage), so every image that reaches the canvas is
// something it can draw.
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

// heic2any wraps a ~1.5 MB libheif wasm build, so it's dynamically imported
// and only pulled down when a file actually needs transcoding.
async function heicToJpegBlob(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: IMAGE_JPEG_QUALITY });
  return Array.isArray(converted) ? converted[0] : converted;
}

// Safari can draw HEIC to a canvas natively; Chrome/Firefox/Android can't. So
// try the native decode first (free, works for every normal JPG/PNG and for
// HEIC on Apple devices) and only fall back to the wasm transcode when a HEIC
// file fails that path. Non-HEIC decode failures propagate untouched so the
// batch's allSettled can skip just that file.
async function loadDecodableImage(file: File): Promise<{ image: HTMLImageElement; source: Blob }> {
  try {
    return { image: await loadImageFromBlob(file), source: file };
  } catch (err) {
    if (!isHeic(file)) throw err;
    const jpeg = await heicToJpegBlob(file);
    return { image: await loadImageFromBlob(jpeg), source: jpeg };
  }
}

async function imageAsCompressedDataURL(file: File): Promise<string> {
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

// HEIC/HEIF is the iPhone camera default. Only Safari can draw it to a
// <canvas>; elsewhere we transcode it to JPEG first (loadDecodableImage), and
// this predicate is how both paths recognise it — by MIME type, or by extension
// when the picker hands it over with an empty type.
const HEIC_RE = /\.(heic|heif)$/i;

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_RE.test(file.name);
}

/**
 * Splits a raw picker/drop selection into image candidates and a count of
 * everything clearly-not-an-image (PDFs, video, docs). MIME type is a hint, not
 * a gate: plenty of real photos arrive with an *empty* `file.type` (mobile
 * share sheets, extension-less files, some cloud pickers), and dropping those
 * silently is what leaves the user staring at "Choose at least one photo" after
 * they definitely chose one. So anything with no type, or an `image/*` type, is
 * kept and left for the canvas decoder to accept or reject; only a file that
 * declares a non-image type is turned away. HEIC stays in `images` because we
 * can transcode it.
 */
function partitionImageFiles(list: FileList | null): { images: File[]; rejected: number } {
  const all = Array.from(list ?? []);
  const images = all.filter((f) => !f.type || f.type.startsWith("image/") || isHeic(f));
  return { images, rejected: all.length - images.length };
}

function imageLabel(files: File[]): string {
  if (files.length === 0) return "Choose or drop photos";
  if (files.length === 1) return files[0].name;
  return `${files.length} photos selected`;
}

type ImageValidationError = { message: string; category: ImportFailureCode };

function validateImageFiles(files: File[]): ImageValidationError | null {
  if (files.length > MAX_IMAGE_FILES) {
    return { message: `Choose up to ${MAX_IMAGE_FILES} photos at a time.`, category: "too_large" };
  }
  // Cloud pickers (iCloud, Drive) can hand back a 0-byte placeholder for a file
  // that hasn't finished downloading. It would pass every size check and only
  // die at decode — catch it here with something the user can act on.
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

async function prepareImageDataUrls(files: File[]): Promise<string[]> {
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

export function ImportPanel({
  items,
  workspace = false,
  initialMode = "url",
  submitLabel = "Add",
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
  onRemoveRecipe,
}: {
  items: QueueItem[];
  workspace?: boolean;
  initialMode?: ImportMethod;
  submitLabel?: string;
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  const [mode, setMode] = useState<ImportMethod>(initialMode);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const overflowActive = OVERFLOW_MODES.some((option) => option.id === mode);
  // While the print list is empty, surface every import option so people learn
  // what's available; once a recipe is added, tuck the extras into the overflow.
  const expanded = items.length === 0;

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!overflowRef.current?.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOverflowOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function chooseMode(nextMode: ImportMethod) {
    setMode(nextMode);
    setOverflowOpen(false);
    resetError();
  }

  function resetError() {
    if (error) setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === "url") {
      const trimmed = url.trim();
      if (!trimmed) return setError("Paste a recipe URL first.");
      try {
        new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      } catch {
        return setError("That doesn't look like a valid URL.");
      }
      onAddUrl(trimmed);
      setUrl("");
    } else if (mode === "image") {
      // A failed image import dies here in the browser, before a queue item
      // exists — so unlike URL/text, the queue never gets to report it. Emit
      // the started+failed pair ourselves so these don't vanish from the funnel
      // (this is where "Choose at least one photo" was hiding).
      if (imageFiles.length === 0) {
        trackImageFailure("no_files", "no usable photo selected");
        return setError("Choose at least one photo.");
      }
      const validationError = validateImageFiles(imageFiles);
      if (validationError) {
        trackImageFailure(validationError.category, validationError.message);
        return setError(validationError.message);
      }
      setBusy(true);
      const files = imageFiles;
      try {
        const dataUrls = await prepareImageDataUrls(files);
        onAddImages(dataUrls, imageLabel(files));
        setImageFiles([]);
      } catch (err) {
        const category = err instanceof ImportError ? err.code : "decode_failed";
        const reason = truncateReason(err);
        setError(err instanceof Error ? err.message : "Couldn't read those images. Try different files.");
        // The image never decoded, so there's no compressed payload — stash the
        // *originals* (unless they were merely too large) so a decode/HEIC bug
        // is reproducible. Best-effort; the failure log fires either way.
        if (category === "too_large") {
          trackImageFailure(category, reason);
        } else {
          const debugPath = await captureFailedImportImages(files, { source: "image", category, reason });
          trackImageFailure(category, reason, debugPath ?? undefined);
        }
      } finally {
        setBusy(false);
      }
    } else {
      const trimmed = text.trim();
      if (trimmed.length < 20) return setError("Paste a bit more recipe text first.");
      onAddText(trimmed);
      setText("");
    }
  }

  // Client-side image failures never reach the queue's runParse, so they'd be
  // invisible in analytics. Fire the started+failed pair here to keep the
  // import funnel honest across the browser/queue boundary. Only the failure
  // branch emits — a successful prep is counted by the queue instead, so no
  // attempt is double-reported.
  function trackImageFailure(category: ImportFailureCode, reason: string, debugPath?: string) {
    track("recipe_import_started", { source: "image" });
    track("recipe_import_failed", {
      source: "image",
      category,
      reason,
      ...(debugPath ? { debugPath } : {}),
    });
  }

  // Shared by the file picker and drag-and-drop: never silently swallow a
  // selection. If the files aren't images, or the images don't validate, say so
  // rather than leaving the dropzone looking untouched. (Selection-time
  // problems aren't tracked — an import attempt only counts once the user hits
  // Add, which handleSubmit reports.)
  function selectImageFiles(list: FileList | null) {
    const { images, rejected } = partitionImageFiles(list);
    if (images.length === 0) {
      setImageFiles([]);
      if (rejected > 0) setError("Those files aren't photos we can read. Choose JPG or PNG images.");
      return;
    }
    const validationError = validateImageFiles(images);
    if (validationError) {
      setImageFiles([]);
      setError(validationError.message);
      return;
    }
    setImageFiles(images);
    resetError();
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    if (e.dataTransfer.files.length > 0) selectImageFiles(e.dataTransfer.files);
  }

  return (
    <section
      className={`rp-import-panel panel p-0 lg:p-cp-6 animate-fade-up ${
        workspace ? "rp-import-panel--workspace" : ""
      } ${mode === "cookpilot" ? "rp-import-panel--cookpilot" : ""}`}
      aria-labelledby={workspace ? "rp-import-heading" : undefined}
      aria-label={workspace ? undefined : "Import recipes"}
    >
      {workspace && (
        <div className="mb-cp-4">
          <h2 id="rp-import-heading" className="text-cp-h2 font-extrabold tracking-[-0.02em]">
            Add recipes
          </h2>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mode-toggle-shell">
        <div
          className={`mode-toggle ${expanded ? "mode-toggle--expanded" : ""}`}
          role="group"
          aria-label="Import source"
        >
          {(expanded ? MODES : PRIMARY_MODES).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              disabled={busy}
              className={`mode-toggle__item ${mode === id ? "is-active" : ""}`}
              onClick={() => chooseMode(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}

          {!expanded && (
            <div ref={overflowRef} className="mode-toggle-overflow">
              <button
                type="button"
                aria-label="More import options"
                aria-haspopup="menu"
                aria-expanded={overflowOpen}
                disabled={busy}
                className={`mode-toggle__item mode-toggle__item--icon ${
                  overflowActive ? "is-active" : ""
                }`}
                onClick={() => setOverflowOpen((open) => !open)}
              >
                <MoreVerticalIcon size={18} />
              </button>

              {overflowOpen && (
                <div className="mode-toggle-menu mode-toggle-menu--compact" role="menu" aria-label="More import options">
                  {OVERFLOW_MODES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === id}
                      className={`mode-toggle-menu__item ${mode === id ? "is-active" : ""}`}
                      onClick={() => chooseMode(id)}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {mode === "cookpilot" ? (
        <div className="mt-cp-4">
          <CookPilotImportSource
            items={items}
            onAddRecipes={onAddCookPilotRecipes}
            onRemoveRecipe={onRemoveRecipe}
          />
        </div>
      ) : (
      <form className="flex flex-col gap-cp-4 mt-cp-4" onSubmit={handleSubmit}>
        {mode === "url" && (
          <div className="flex flex-col">
            <label className="field-label" htmlFor="rp-url">
              Recipe URL
            </label>
            <div className="flex flex-col gap-cp-4 lg:flex-row lg:items-center lg:gap-cp-2">
              <input
                id="rp-url"
                type="url"
                className="field flex-1"
                placeholder="Paste recipe URL here"
                value={url}
                autoFocus
                onChange={(e) => {
                  setUrl(e.target.value);
                  resetError();
                }}
              />
              <button
                type="submit"
                className="btn btn-primary rp-import-submit w-full lg:w-auto"
                disabled={busy}
              >
                {busy ? <UploadIcon size={18} /> : <PlusIcon size={18} />}
                {submitLabel}
              </button>
            </div>
          </div>
        )}

        {mode === "image" && (
          <div>
            <label className="field-label">Recipe photos</label>
            <label
              className={`dropzone ${dragging ? "is-dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={(e) => {
                if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
                setDragging(false);
              }}
              onDrop={onDrop}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                className="sr-only absolute h-px w-px overflow-hidden"
                onChange={(e) => {
                  selectImageFiles(e.target.files);
                  // Clear the input so picking the SAME file again still fires
                  // onChange — otherwise a retry after an error is a silent
                  // no-op and the selection looks stuck at empty.
                  e.target.value = "";
                }}
              />
              <UploadIcon size={26} />
              <span className="text-cp-body">{imageLabel(imageFiles)}</span>
              <span className="text-cp-caption font-medium text-ink-soft">
                Snap a cookbook page or screenshot, or drop multiple for one recipe
              </span>
            </label>
          </div>
        )}

        {mode === "text" && (
          <div>
            <label className="field-label" htmlFor="rp-text">
              Recipe text
            </label>
            <textarea
              id="rp-text"
              className="field min-h-56"
              placeholder={"Paste a full recipe with the title, ingredients, and steps.\n\nGrandma's Banana Bread\n\n2 cups flour\n3 ripe bananas\n…"}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                resetError();
              }}
            />
          </div>
        )}

        {mode !== "url" && (
          <button type="submit" className="btn btn-primary rp-import-submit w-full" disabled={busy}>
            {busy ? <UploadIcon size={18} /> : <PlusIcon size={18} />}
            {submitLabel}
          </button>
        )}
      </form>
      )}

      {error && (
        <div className="state state--error mt-cp-4" role="alert">
          <h4>Couldn&apos;t add that</h4>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
