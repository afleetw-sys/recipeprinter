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
import { normalizeImportURL } from "@/lib/cookpilot";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { captureFailedImportImages } from "@/lib/failedImportCapture";
import {
  imageLabel,
  partitionImageFiles,
  prepareImageDataUrls,
  validateImageFiles,
} from "@/lib/imageImport";
import {
  CookPilotLogoIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  MoreVerticalIcon,
  PlusIcon,
  SpinnerIcon,
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

const loadCookPilotImport = () => import("@/components/CookPilotRecipePicker");

const CookPilotImportSource = dynamic(
  () => loadCookPilotImport().then((mod) => mod.CookPilotImportSource),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 grid place-items-center text-ink-soft rounded-2xl border border-dashed border-line-strong">
        <span className="inline-flex items-center gap-2">
          <SpinnerIcon size={ICON_SIZE.lg} />
          Opening CookPilot…
        </span>
      </div>
    ),
  },
);

export function ImportPanel({
  items,
  workspace = false,
  initialMode = "url",
  submitLabel = "Add",
  autoFocusUrl = true,
  expanded: expandedOverride,
  busy: busyOverride,
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
  /** Autofocus the URL input on mount. Off on SEO capture blocks, where the panel
      can sit below the fold and stealing focus would scroll the page on load. */
  autoFocusUrl?: boolean;
  /** Show every import method, regardless of what's in the queue. Surfaces
      where this panel IS the page pass true: collapsing the options someone is
      looking at, because a parse happens to be in flight, hides the control
      they just used at the moment they are most likely to reach for it again. */
  expanded?: boolean;
  /** Forces the busy state on from outside, for a caller whose work continues
      after the handler returns. The URL and text paths are synchronous from
      this panel's point of view, so it has nothing of its own to show — but on
      the homepage `onAddUrl` starts a navigation into the studio, and until
      that lands the only feedback was the field going blank. Can force busy on,
      never off: the panel's own async work still owns its own state. */
  busy?: boolean;
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  useEffect(() => {
    // CookPilot is a primary import option, but its Firebase/Auth code is large
    // enough to keep out of the initial page bundle. Fetch and initialize it
    // once the browser is idle so choosing CookPilot feels immediate without
    // delaying first paint.
    //
    // Only for a browser that has been signed in before. Importing from a
    // CookPilot recipe library requires a CookPilot account, so prewarming for
    // someone who has never had one buys nothing and costs the whole Firebase
    // SDK — this chunk reaches Firestore (lib/cookpilotRecipes imports it
    // statically) as well as Auth. That was tolerable while this panel only
    // rendered on a page that already loaded Firebase; it stops being tolerable
    // the moment the panel is what the marketing homepage shows.
    //
    // Same Firebase-free hint the header's account control uses to decide
    // whether to fetch its own menu (see lib/cookPilotSession).
    if (!readCookPilotWasSignedIn()) return;
    const prewarm = () => {
      void loadCookPilotImport().then((mod) => mod.prewarmCookPilotImport());
    };
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prewarm, { timeout: 1_500 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = globalThis.setTimeout(prewarm, 500);
    return () => globalThis.clearTimeout(timer);
  }, []);

  const [mode, setMode] = useState<ImportMethod>(initialMode);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selfBusy, setBusy] = useState(false);
  const busy = busyOverride || selfBusy;
  const [error, setError] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Focus the URL field without scrolling to it.
   *
   * This was the `autoFocus` attribute, which React honours by calling
   * `.focus()` with no options — and focusing an element the browser considers
   * off-screen scrolls it into view. On a short window that yanked whatever sat
   * above the panel out of the viewport: on the studio's empty state, the one
   * line of orientation a first-time visitor needs. `preventScroll` keeps the
   * convenience and drops the jump.
   */
  useEffect(() => {
    if (!autoFocusUrl) return;
    urlInputRef.current?.focus({ preventScroll: true });
    // Once, on mount, matching what the attribute did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const overflowActive = OVERFLOW_MODES.some((option) => option.id === mode);
  // While the print list is empty, surface every import option so people learn
  // what's available; once a recipe is added, tuck the extras into the overflow.
  // Defaults to "nothing added yet", which is right for the add-recipe dialog
  // opened over a deck. Anywhere the panel is the main event, the caller says so.
  const expanded = expandedOverride ?? items.length === 0;

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
                placeholder="Paste recipe URL here"
                value={url}
                ref={urlInputRef}
                onChange={(e) => {
                  setUrl(e.target.value);
                  resetError();
                }}
              />
              <button
                type="submit"
                className="btn btn-primary rp-import-submit w-full lg:w-auto lg:shrink-0"
                disabled={busy}
              >
                {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : <PlusIcon size={ICON_SIZE.md} />}
                {submitLabel}
              </button>
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

        {mode !== "url" && (
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
