"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type FormEvent,
  type MutableRefObject,
} from "react";
import dynamic from "next/dynamic";
import type { ImportTab } from "@/types/recipe";
import type { QueueItem } from "@/types/recipe";
import { track, truncateReason, type ImportFailureCode } from "@/lib/analytics";
import { ImportError } from "@/lib/parser";
import { normalizeImportURL } from "@/lib/cookpilot";
import { captureFailedImportImages, recordFailedImport } from "@/lib/failedImportCapture";
import {
  imageLabel,
  partitionImageFiles,
  prepareImageDataUrls,
  validateImageFiles,
} from "@/lib/imageImport";
import {
  AppsIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  MoreVerticalIcon,
  PlusIcon,
  SpinnerIcon,
  TextIcon,
  UploadIcon,
} from "@/components/icons";
import { ButtonToggle } from "@/components/ButtonToggle";
import { useMenuDismiss } from "@/lib/useMenuDismiss";

// Compact import switch: a link and the recipe apps are first-class;
// lower-frequency sources live behind an overflow menu so the workspace rail
// stays quiet.

const MODES: {
  id: ImportTab;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "url", label: "Link", icon: LinkIcon },
  { id: "apps", label: "Recipe apps", icon: AppsIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "text", label: "Paste Text", icon: TextIcon },
];

const PRIMARY_MODES = MODES.filter((mode) => mode.id === "url" || mode.id === "apps");
const OVERFLOW_MODES = MODES.filter((mode) => mode.id === "image" || mode.id === "text");

const loadRecipeApps = () => import("@/components/import/RecipeAppsPanel");

const RecipeAppsPanel = dynamic(() => loadRecipeApps().then((mod) => mod.RecipeAppsPanel), {
  ssr: false,
  loading: () => (
    <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
      <span className="inline-flex items-center gap-2">
        <SpinnerIcon size={ICON_SIZE.lg} />
        Opening your recipe apps…
      </span>
    </div>
  ),
});

export function ImportPanel({
  items,
  workspace = false,
  initialMode = "url",
  submitLabel = "Add",
  hideSubmit = false,
  showAllModes = false,
  onModeChange,
  autoFocusUrl = true,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddReadyRecipes,
  onRemoveRecipe,
  commitRef,
}: {
  items: QueueItem[];
  workspace?: boolean;
  initialMode?: ImportTab;
  submitLabel?: string;
  /** Drop the panel's own submit button: the surface around it owns the action
      (the add dialog puts one Add at the bottom instead of two buttons). */
  hideSubmit?: boolean;
  /** Show every source, whatever is already in the queue. The overflow exists to
      keep the workspace rail quiet; a dialog whose only job is adding has no
      rail to keep quiet. */
  showAllModes?: boolean;
  /** Which source is showing. The add dialog sizes itself to it: a paste box
      wants far more room than a URL field. */
  onModeChange?: (mode: ImportTab) => void;
  /** Autofocus the URL input on mount. Off on SEO capture blocks, where the panel
      can sit below the fold and stealing focus would scroll the page on load. */
  autoFocusUrl?: boolean;
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddReadyRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
  /** Filled in by this panel with a function that submits whatever is in the
      form, so a parent's own "done" button can finish the job. */
  commitRef?: MutableRefObject<(() => boolean) | null>;
}) {
  useEffect(() => {
    // The recipe-app sources are a primary import option, but CookPilot's
    // Firebase/Auth code is large enough to keep out of the initial page
    // bundle. Fetch and initialize it once the browser is idle so choosing the
    // tab feels immediate without delaying first paint.
    const prewarm = () => {
      void loadRecipeApps().then((mod) => mod.prewarmCookPilotImport());
    };
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prewarm, { timeout: 1_500 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = globalThis.setTimeout(prewarm, 500);
    return () => globalThis.clearTimeout(timer);
  }, []);

  const [mode, setMode] = useState<ImportTab>(initialMode);
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
  // Inside the add dialog that rule inverts — see `showAllModes`.
  const expanded = showAllModes || items.length === 0;

  const closeOverflow = useCallback(() => setOverflowOpen(false), []);
  useMenuDismiss(overflowRef, closeOverflow, { enabled: overflowOpen });

  function chooseMode(nextMode: ImportTab) {
    setMode(nextMode);
    onModeChange?.(nextMode);
    setOverflowOpen(false);
    resetError();
  }

  function resetError() {
    if (error) setError(null);
  }

  /** `e` is optional so this can be called imperatively — see `commitRef`. */
  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === "url") {
      const trimmed = url.trim();
      if (!trimmed) return setError("Paste a recipe link first.");
      try {
        // Validate through the same normalizer the queue and parser use, so the
        // client gate can't reject a URL the pipeline would happily import (it
        // was stricter here — case-sensitive scheme check, no whitespace strip).
        new URL(normalizeImportURL(trimmed));
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
        const captureMeta = { source: "image", category, reason };
        if (category === "too_large") {
          // Nothing to keep: the file was over the cap before it was read. The
          // row still goes in so the failure is in the same list as the rest.
          await recordFailedImport(captureMeta, { imageCount: files.length });
          trackImageFailure(category, reason);
        } else {
          const debugPath = await captureFailedImportImages(files, captureMeta);
          await recordFailedImport(captureMeta, {
            imagePath: debugPath,
            imageCount: files.length,
          });
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

  /**
   * Whether there is something typed, pasted or chosen that has not been added.
   *
   * The recipe-app sources are excluded on purpose: they add through their own
   * lists rather than through this form, so there is never anything of theirs
   * left sitting in the field.
   */
  function hasUncommittedInput(): boolean {
    if (mode === "url") return url.trim().length > 0;
    if (mode === "text") return text.trim().length > 0;
    if (mode === "image") return imageFiles.length > 0;
    return false;
  }

  /**
   * Lets a parent commit whatever is in the form without pressing Add.
   *
   * The add dialog's "Done" closes it, and someone who has pasted a link and
   * gone straight for Done has plainly asked for that link — they just used
   * the button that finishes the job rather than the one that starts it. This
   * hands Done the same code path Add uses, validation and all, instead of a
   * second implementation that would drift from it.
   *
   * Returns whether there was anything to commit, so a Done pressed over an
   * empty form stays a plain close and does not raise "Paste a recipe link
   * first" at someone who is leaving.
   */
  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = () => {
      if (busy || !hasUncommittedInput()) return false;
      void handleSubmit();
      return true;
    };
    return () => {
      commitRef.current = null;
    };
  });

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
      } ${mode === "apps" ? "rp-import-panel--apps" : ""}`}
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
        <ButtonToggle
          className={`mode-toggle ${expanded ? "mode-toggle--expanded" : ""}`}
          label="Import source"
          options={expanded ? MODES : PRIMARY_MODES}
          value={mode}
          onChange={chooseMode}
          disabled={busy}
        >
          {!expanded && (
            <div ref={overflowRef} className="mode-toggle-overflow">
              {/* Wears the option's own class so it sits in the row as a
                  sibling, but it opens a menu rather than choosing a mode, so
                  it is not one of the toggle's options. */}
              <button
                type="button"
                aria-label="More import options"
                aria-haspopup="menu"
                aria-expanded={overflowOpen}
                disabled={busy}
                className={`btn-toggle__option btn-toggle__option--icon ${
                  overflowActive ? "is-active" : ""
                }`}
                onClick={() => setOverflowOpen((open) => !open)}
              >
                <MoreVerticalIcon size={18} />
              </button>

              {overflowOpen && (
                <div className="cp-menu mode-toggle-menu" role="menu" aria-label="More import options">
                  {OVERFLOW_MODES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === id}
                      className={`cp-menu__item ${mode === id ? "is-active" : ""}`}
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
        </ButtonToggle>
      </div>

      {mode === "apps" ? (
        <div className="mt-cp-4">
          <RecipeAppsPanel
            items={items}
            onAddRecipes={onAddReadyRecipes}
            onRemoveRecipe={onRemoveRecipe}
          />
        </div>
      ) : (
      <form className="flex flex-col gap-cp-4 mt-cp-4" onSubmit={handleSubmit}>
        {mode === "url" && (
          <div className="flex flex-col">
            <label className="field-label" htmlFor="rp-url">
              Recipe link
            </label>
            {/* The button is shorter than the field, so it centers against it
                rather than sitting top-aligned. The error message lives OUTSIDE
                this row on purpose: inside, it counted toward the height the
                button centers on, and the button drifted down the moment a bad
                URL was typed. */}
            <div className="flex flex-col gap-cp-4 lg:flex-row lg:items-center lg:gap-cp-2">
              <input
                id="rp-url"
                type="url"
                className="field w-full lg:flex-1 lg:min-w-0"
                placeholder="Paste recipe link here"
                value={url}
                autoFocus={autoFocusUrl}
                onChange={(e) => {
                  setUrl(e.target.value);
                  resetError();
                }}
              />
              {!hideSubmit && (
                <button
                  type="submit"
                  className="btn btn-primary rp-import-submit w-full lg:w-auto lg:shrink-0"
                  disabled={busy}
                >
                  {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : <PlusIcon size={ICON_SIZE.md} />}
                  {submitLabel}
                </button>
              )}
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
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
            {error && <p className="field-error" role="alert">{error}</p>}
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
            {error && <p className="field-error" role="alert">{error}</p>}
          </div>
        )}

        {mode !== "url" && !hideSubmit && (
          <button type="submit" className="btn btn-primary rp-import-submit w-full" disabled={busy}>
            {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : <PlusIcon size={ICON_SIZE.md} />}
            {submitLabel}
          </button>
        )}
      </form>
      )}

    </section>
  );
}
