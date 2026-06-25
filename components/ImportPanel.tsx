"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type FormEvent,
} from "react";
import { CookPilotImportSource } from "@/components/CookPilotRecipePicker";
import type { ImportMethod } from "@/types/recipe";
import type { QueueItem } from "@/types/recipe";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CookPilotLogoIcon,
  ImageIcon,
  LinkIcon,
  TextIcon,
  UploadIcon,
} from "@/components/icons";

// Mirrors CookPilot's New Recipe dialog (ImportRecipePanel): a mode toggle, a
// per-mode input, and a single primary "Create printable recipe" action.
// CookPilot ships URL + Image; RecipePrinter adds Pasted text (backed by
// CookPilot's social text parser) so recipes can come from anywhere.

const MODES: {
  id: ImportMethod;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "url", label: "URL", icon: LinkIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "cookpilot", label: "CookPilot", icon: CookPilotLogoIcon },
  { id: "text", label: "Paste Text", icon: TextIcon },
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
  items,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
}: {
  items: QueueItem[];
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
}) {
  const [mode, setMode] = useState<ImportMethod>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeScrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const scroller = modeScrollerRef.current;
    if (!scroller) return;
    const scrollerEl = scroller;

    function updateScrollHints() {
      setCanScrollLeft(scrollerEl.scrollLeft > 1);
      setCanScrollRight(
        scrollerEl.scrollLeft + scrollerEl.clientWidth < scrollerEl.scrollWidth - 1,
      );
    }

    updateScrollHints();
    scrollerEl.addEventListener("scroll", updateScrollHints, { passive: true });
    window.addEventListener("resize", updateScrollHints);
    return () => {
      scrollerEl.removeEventListener("scroll", updateScrollHints);
      window.removeEventListener("resize", updateScrollHints);
    };
  }, []);

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
    <section className="panel p-cp-5 sm:p-cp-6 animate-fade-up">
      {/* Mode toggle — mirrors CookPilot's import-mode-toggle */}
      <div className="mode-toggle-shell">
        {canScrollLeft && (
          <button
            type="button"
            className="mode-toggle-arrow mode-toggle-arrow--left"
            aria-label="Show previous import options"
            onClick={() => modeScrollerRef.current?.scrollBy({ left: -150, behavior: "smooth" })}
          >
            <ChevronLeftIcon size={16} />
          </button>
        )}
        <div ref={modeScrollerRef} className="mode-toggle" role="tablist" aria-label="Import source">
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
        {canScrollRight && (
          <button
            type="button"
            className="mode-toggle-arrow mode-toggle-arrow--right"
            aria-label="Show more import options"
            onClick={() => modeScrollerRef.current?.scrollBy({ left: 150, behavior: "smooth" })}
          >
            <ChevronRightIcon size={16} />
          </button>
        )}
      </div>

      {mode === "cookpilot" ? (
        <div className="mt-cp-4">
          <CookPilotImportSource items={items} onAddRecipes={onAddCookPilotRecipes} />
        </div>
      ) : (
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
      )}

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
