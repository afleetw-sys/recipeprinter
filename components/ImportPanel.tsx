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
import {
  CookPilotLogoIcon,
  ImageIcon,
  LinkIcon,
  MoreVerticalIcon,
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
    loading: () => (
      <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
        Loading CookPilot
      </div>
    ),
  },
);

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
  workspace = false,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
  onRemoveRecipe,
}: {
  items: QueueItem[];
  workspace?: boolean;
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  const [mode, setMode] = useState<ImportMethod>("url");
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
    <section
      className={`rp-import-panel panel p-cp-5 sm:p-cp-6 animate-fade-up ${
        workspace ? "rp-import-panel--workspace" : ""
      }`}
      aria-labelledby={workspace ? "rp-import-heading" : undefined}
      aria-label={workspace ? undefined : "Import recipes"}
    >
      {workspace && (
        <div className="hidden lg:block mb-cp-4">
          <h2 id="rp-import-heading" className="text-[1.06rem] font-extrabold tracking-[-0.02em]">
            Import
          </h2>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mode-toggle-shell">
        <div
          className={`mode-toggle ${expanded ? "mode-toggle--expanded" : ""}`}
          role="tablist"
          aria-label="Import source"
        >
          {(expanded ? MODES : PRIMARY_MODES).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
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
                <div className="mode-toggle-menu" role="menu" aria-label="More import options">
                  {OVERFLOW_MODES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === id}
                      className={`mode-toggle-menu__item ${mode === id ? "is-active" : ""}`}
                      onClick={() => chooseMode(id)}
                    >
                      <Icon size={17} />
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
          <div>
            <label className="field-label" htmlFor="rp-url">
              Recipe URL
            </label>
            <input
              id="rp-url"
              type="url"
              className="field"
              placeholder="https://recipes.example/your-recipe"
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
              className="field"
              placeholder={"Paste a full recipe with the title, ingredients, and steps.\n\nGrandma's Banana Bread\n\n2 cups flour\n3 ripe bananas\n…"}
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
    </section>
  );
}
