"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  SpinnerIcon,
  TextIcon,
  UploadIcon,
} from "@/components/icons";
import { stashPendingImport } from "@/lib/pendingImport";
import { imageLabel, partitionImageFiles, prepareImageDataUrls, validateImageFiles } from "@/lib/imageImport";
import type { ImportMethod } from "@/types/recipe";

// Capture for the SEO landing pages: a link field, a paste box, or a photo
// dropzone, with the page's own intent preselected. All three are offered
// because a page's headline intent is not the only way its visitors have the
// recipe — someone reading about preserving family recipes has a photograph of
// a card AND a link from a cousin, and a page that shows one field is telling
// them the other is not supported.
//
// CookPilot is the one import method deliberately left out: it needs an
// account, and there is no account on a marketing page.
//
// On submit it stashes the payload and hands off to the app at "/", which
// finishes the import.
type CaptureMode = "url" | "text" | "image";

const MODES: {
  id: CaptureMode;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
}[] = [
  { id: "url", label: "Link", icon: LinkIcon },
  { id: "image", label: "Photo", icon: ImageIcon },
  { id: "text", label: "Paste text", icon: TextIcon },
];

function resolveMode(method?: ImportMethod): CaptureMode {
  if (method === "text") return "text";
  if (method === "image") return "image";
  return "url";
}

export function SeoCapture({
  initialMode = "url",
  modes,
  submitLabel = "Start printing",
  placeholder,
}: {
  initialMode?: ImportMethod;
  /** Which sources this page offers, in order. Defaults to all three. */
  modes?: ImportMethod[];
  submitLabel?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const offered = modes?.length
    ? MODES.filter((option) => modes.some((wanted) => resolveMode(wanted) === option.id))
    : MODES;
  const [mode, setMode] = useState<CaptureMode>(resolveMode(initialMode));
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handoff(payload: Parameters<typeof stashPendingImport>[0]) {
    setBusy(true);
    const ok = await stashPendingImport(payload);
    // Even if persistence failed (private mode, quota), send them to the working
    // tool rather than stranding them on the landing page.
    router.push("/");
    if (!ok) setBusy(false);
  }

  function selectFiles(list: FileList | null) {
    const { images, rejected } = partitionImageFiles(list);
    if (images.length === 0) {
      setFiles([]);
      if (rejected > 0) setError("Those files aren't photos we can read. Choose JPG or PNG images.");
      return;
    }
    const validationError = validateImageFiles(images);
    if (validationError) {
      setFiles([]);
      setError(validationError.message);
      return;
    }
    setFiles(images);
    setError(null);
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
      return handoff({ kind: "url", url: trimmed });
    }

    if (mode === "text") {
      const trimmed = text.trim();
      if (trimmed.length < 20) return setError("Paste a bit more recipe text first.");
      return handoff({ kind: "text", text: trimmed });
    }

    // image
    if (files.length === 0) return setError("Choose at least one photo.");
    const validationError = validateImageFiles(files);
    if (validationError) return setError(validationError.message);
    setBusy(true);
    try {
      const images = await prepareImageDataUrls(files);
      const ok = await stashPendingImport({ kind: "images", images, label: imageLabel(files) });
      router.push("/");
      if (!ok) setBusy(false);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Couldn't read those images. Try different files.");
    }
  }

  const submitButton = (
    <button
      type="submit"
      className={`btn btn-primary rp-import-submit w-full ${mode === "url" ? "lg:w-auto lg:shrink-0" : ""}`}
      disabled={busy}
    >
      {submitLabel}
      {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : <ArrowRightIcon size={ICON_SIZE.md} />}
    </button>
  );

  return (
    <form className="flex flex-col gap-cp-4" onSubmit={handleSubmit}>
      <div
        className="mode-toggle mode-toggle--seo"
        role="group"
        aria-label="How do you have the recipe?"
        /* Column count follows the number of sources offered, so a two-source
           page gets two full-width halves rather than two thirds and a gap. */
        style={{ gridTemplateColumns: `repeat(${offered.length}, minmax(0, 1fr))` }}
      >
        {offered.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            disabled={busy}
            className={`mode-toggle__item ${mode === id ? "is-active" : ""}`}
            onClick={() => {
              setMode(id);
              setError(null);
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {mode === "url" && (
        <div className="flex flex-col">
          <label htmlFor="seo-url" className="field-label">
            Recipe URL
          </label>
          {/* The button sits centred on the field, not aligned to its top, and
              the error message lives OUTSIDE the row — inside it, an error
              grew the input's column and pushed the button off centre. */}
          <div className="flex flex-col gap-cp-4 lg:flex-row lg:items-center lg:gap-cp-2">
            <input
              id="seo-url"
              type="url"
              className="field w-full lg:flex-1 lg:min-w-0"
              placeholder={placeholder ?? "Paste recipe URL here"}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
            />
            {submitButton}
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}

      {mode === "text" && (
        <>
          <label htmlFor="seo-text" className="field-label">
            Recipe text
          </label>
          <textarea
            id="seo-text"
            className="field min-h-56"
            placeholder={placeholder ?? "Paste the recipe text or caption here"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && <p className="field-error" role="alert">{error}</p>}
          {submitButton}
        </>
      )}

      {mode === "image" && (
        <>
          <span className="field-label">Recipe photos</span>
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
            onDrop={(e: DragEvent<HTMLLabelElement>) => {
              e.preventDefault();
              setDragging(false);
              if (!busy && e.dataTransfer.files.length > 0) selectFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              className="sr-only absolute h-px w-px overflow-hidden"
              onChange={(e) => {
                selectFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <UploadIcon size={26} />
            <span className="text-cp-body">{imageLabel(files)}</span>
            <span className="text-cp-caption font-medium text-ink-soft">
              {placeholder ?? "Snap a cookbook page or screenshot, or drop a photo"}
            </span>
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          {submitButton}
        </>
      )}

    </form>
  );
}
