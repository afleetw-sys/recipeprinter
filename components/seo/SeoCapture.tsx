"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ICON_SIZE, SpinnerIcon, UploadIcon } from "@/components/icons";
import { stashPendingImport } from "@/lib/pendingImport";
import { ensureWorkingProjectId } from "@/lib/project";
import { imageLabel, partitionImageFiles, prepareImageDataUrls, validateImageFiles } from "@/lib/imageImport";
import type { ImportMethod } from "@/types/recipe";

// A deliberately minimal capture for the SEO landing pages: just the one input
// that matches the page's intent (a URL field, a paste box, or a photo dropzone)
// plus an import button, no mode toggles, no other options. On submit it stashes
// the payload and hands off to the studio, which finishes the import. The full
// multi-source importer lives on the app itself, not on the marketing pages.
type CaptureMode = "url" | "text" | "image";

function resolveMode(method?: ImportMethod): CaptureMode {
  if (method === "text") return "text";
  if (method === "image") return "image";
  return "url";
}

export function SeoCapture({
  initialMode = "url",
  submitLabel = "Start printing",
  placeholder,
}: {
  initialMode?: ImportMethod;
  submitLabel?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const mode = resolveMode(initialMode);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handoff(payload: Parameters<typeof stashPendingImport>[0]) {
    setBusy(true);
    const ok = await stashPendingImport(payload);
    // Straight to the studio, not to the homepage. The homepage was a detour
    // through a second importer and a Preview button for someone who had
    // already told us what they wanted; the studio just shows them the page.
    // Even if persistence failed (private mode, quota), send them to the
    // working tool rather than stranding them on the landing page.
    router.push(`/projects/${encodeURIComponent(ensureWorkingProjectId())}`);
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
      className={`btn btn-primary rp-import-submit w-full ${mode === "url" ? "lg:w-auto" : ""}`}
      disabled={busy}
    >
      {submitLabel}
      {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : <ArrowRightIcon size={ICON_SIZE.md} />}
    </button>
  );

  return (
    <form className="flex flex-col gap-cp-4" onSubmit={handleSubmit}>
      {mode === "url" && (
        <div className="flex flex-col">
          <label htmlFor="seo-url" className="field-label">
            Recipe URL
          </label>
          <div className="flex flex-col gap-cp-4 lg:flex-row lg:items-start lg:gap-cp-2">
            <div className="flex-1">
              <input
                id="seo-url"
                type="url"
                className="field w-full"
                placeholder={placeholder ?? "Paste recipe URL here"}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError(null);
                }}
              />
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>
            {submitButton}
          </div>
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
