"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import type { ImportMethod } from "@/types/recipe";
import {
  ImageIcon,
  LinkIcon,
  TextIcon,
  UploadIcon,
} from "@/components/icons";

// Mirrors CookPilot's New Recipe dialog (ImportRecipePanel): a mode toggle, a
// per-mode input, and a single primary "Create printable recipe" action.
// CookPilot ships URL + Image; RecipePrinter adds Pasted text (backed by
// CookPilot's social text parser) so recipes can come from anywhere.

const MODES: { id: ImportMethod; label: string; icon: typeof LinkIcon }[] = [
  { id: "url", label: "URL", icon: LinkIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "text", label: "Paste text", icon: TextIcon },
];

function readImageAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read image"));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function imageFilesFrom(list: FileList | null): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

function imageLabel(files: File[]): string {
  if (files.length === 0) return "Choose or drop photos";
  if (files.length === 1) return files[0].name;
  return `${files.length} photos selected`;
}

export function ImportPanel({
  onAddUrl,
  onAddImages,
  onAddText,
}: {
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
}) {
  const [mode, setMode] = useState<ImportMethod>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (imageFiles.length === 0) return setError("Choose at least one photo.");
      setBusy(true);
      try {
        const dataUrls = await Promise.all(imageFiles.map(readImageAsDataURL));
        onAddImages(dataUrls, imageLabel(imageFiles));
        setImageFiles([]);
      } catch {
        setError("Couldn't read those images. Try different files.");
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

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const dropped = imageFilesFrom(e.dataTransfer.files);
    if (dropped.length) {
      setImageFiles(dropped);
      resetError();
    }
  }

  return (
    <section className="panel p-cp-5 sm:p-cp-6 animate-fade-up" style={{ ["--mode-count" as string]: MODES.length }}>
      {/* Mode toggle — mirrors CookPilot's import-mode-toggle */}
      <div className="mode-toggle" role="tablist" aria-label="Import source">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            disabled={busy}
            className={`mode-toggle__item ${mode === id ? "is-active" : ""}`}
            onClick={() => {
              setMode(id);
              resetError();
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <form className="flex flex-col gap-cp-4 mt-cp-4" onSubmit={handleSubmit}>
        {mode === "url" && (
          <div>
            <label className="field-label" htmlFor="rp-url">
              Recipe URL
            </label>
            <input
              id="rp-url"
              type="url"
              className="field"
              placeholder="https://www.seriouseats.com/your-recipe"
              value={url}
              autoFocus
              onChange={(e) => {
                setUrl(e.target.value);
                resetError();
              }}
            />
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
                  setImageFiles(imageFilesFrom(e.target.files));
                  resetError();
                }}
              />
              <UploadIcon size={26} />
              <span className="text-[0.92rem]">{imageLabel(imageFiles)}</span>
              <span className="text-[0.78rem] font-medium text-ink-soft">
                Snap a cookbook page or screenshot — drop multiple for one recipe
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
              className="field"
              placeholder={"Paste a full recipe — title, ingredients, and steps.\n\nGrandma's Banana Bread\n\n2 cups flour\n3 ripe bananas\n…"}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                resetError();
              }}
            />
          </div>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? <UploadIcon size={18} /> : <span className="text-lg leading-none">+</span>}
          Create printable recipe
        </button>
      </form>

      {error && (
        <div className="state state--error mt-cp-4" role="alert">
          <h4>Couldn&apos;t add that</h4>
          <p>{error}</p>
        </div>
      )}

      <p className="text-[0.78rem] text-ink-soft mt-cp-4 text-center">
        Printing more than one? Add as many recipes as you want before printing.
      </p>
    </section>
  );
}
