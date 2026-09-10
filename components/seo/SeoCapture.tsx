"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ICON_SIZE, SpinnerIcon, UploadIcon } from "@/components/icons";
import { stashPendingImport } from "@/lib/pendingImport";
import { imageLabel, partitionImageFiles, prepareImageDataUrls, validateImageFiles } from "@/lib/imageImport";
import { ImportError } from "@/lib/parser";
import { normalizeImportURL } from "@/lib/cookpilot";
import { track } from "@/lib/analytics";
import type { ImportTab } from "@/types/recipe";

// A deliberately minimal capture for the SEO landing pages: just the one input
// that matches the page's intent (a URL field, a paste box, or a photo dropzone)
// plus an import button, no mode toggles, no other options. On submit it stashes
// the payload and hands off to the print page, which finishes the import.
//
// It used to hand off to "/", and that was teaching the wrong thing in the first
// ten seconds someone ever spent here: a visitor who pasted one link was
// deposited on a page showing their recipe sitting in a list with a Clear all
// above it and a Preview button beside it, which reads as a cart. It is not a
// cart. That page empties itself on arrival by design, so the next time they
// came back to it for recipe two, the recipe was gone. Landing them where the
// printable card actually is skips the lesson and the round trip both.
//
// An EMPTY field is the exception and still goes to "/" — see `openWorkspace`.
type CaptureMode = "url" | "text" | "image";

function resolveMode(tab?: ImportTab): CaptureMode {
  if (tab === "text") return "text";
  if (tab === "image") return "image";
  return "url";
}

export function SeoCapture({
  initialMode = "url",
  submitLabel = "Start printing",
  placeholder,
}: {
  initialMode?: ImportTab;
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
  const warmedRef = useRef(false);

  async function handoff(payload: Parameters<typeof stashPendingImport>[0]) {
    setBusy(true);
    track("recipe_import_submitted", {
      surface: "capture",
      source: payload.kind === "images" ? "image" : payload.kind === "text" ? "text" : "url",
    });
    const ok = await stashPendingImport(payload);
    // Even if persistence failed (private mode, quota), send them to the working
    // tool rather than stranding them on the landing page.
    router.push("/print");
    if (!ok) setBusy(false);
  }

  /**
   * Start fetching the print page the moment someone touches this.
   *
   * The one real cost of handing off to /print rather than / is that it is the
   * heavier page: / is statically prerendered and free of Firebase, and /print
   * is neither. Warming it on first interaction spends that download while the
   * cook is still typing, instead of after they press the button.
   *
   * On interaction rather than on mount, because most people who see a landing
   * page never submit anything, and pre-loading the whole app for all of them
   * to save a second for some of them is the wrong trade.
   */
  function warmWorkspace() {
    if (warmedRef.current) return;
    warmedRef.current = true;
    router.prefetch("/print");
  }

  function selectFiles(list: FileList | null) {
    warmWorkspace();
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

  /**
   * The way out of a page that only carries one kind of import.
   *
   * Each landing page shows the single capture that matches what it is about,
   * while the front door at "/" carries all of them plus the library imports.
   * So someone who arrives on the Pinterest page holding a photo, a block of
   * text, or a Paprika export can see no route to it from here — and the thing
   * they just tapped said "Start printing". Taking them to the tool keeps that
   * promise. Telling someone with no link to "paste a recipe link first" tells
   * them they came to the wrong page, which they didn't.
   *
   * This one still goes to "/", not to /print, and the difference is the whole
   * point of the split: a submitted payload has a card waiting for it at the
   * end, and an empty field is someone looking for the right box to put
   * something in. "/" is the page that offers boxes; /print with nothing on it
   * offers an empty deck.
   */
  function openWorkspace() {
    setBusy(true);
    router.push("/");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    // An empty field means "I want the tool, not this input" — see
    // `openWorkspace`. Something typed that we can't use is a different thing:
    // a real mistake with a real fix, whose fix is right here. Those keep their
    // inline error, because navigating away would throw the typing out.
    if (mode === "url") {
      const trimmed = url.trim();
      if (!trimmed) return openWorkspace();
      try {
        // Through the same normalizer the queue and parser use, so this gate
        // can't reject a URL the pipeline would happily import. The hand-rolled
        // version here was the stricter one ImportPanel already replaced for
        // exactly that reason: `startsWith("http")` is a literal-character test,
        // so a bare domain that begins with those letters never got its scheme
        // prepended and was rejected, and a link that wrapped across lines on
        // its way through a message or a PDF kept the whitespace the normalizer
        // strips. Both import fine once inside the app; only these pages, which
        // carry the organic traffic, turned them away.
        new URL(normalizeImportURL(trimmed));
      } catch {
        return setError("That doesn't look like a valid URL.");
      }
      return handoff({ kind: "url", url: trimmed });
    }

    if (mode === "text") {
      const trimmed = text.trim();
      if (!trimmed) return openWorkspace();
      if (trimmed.length < 20) return setError("Paste a bit more recipe text first.");
      return handoff({ kind: "text", text: trimmed });
    }

    // image
    if (files.length === 0) return openWorkspace();
    const validationError = validateImageFiles(files);
    if (validationError) return setError(validationError.message);
    setBusy(true);
    try {
      const images = await prepareImageDataUrls(files);
      track("recipe_import_submitted", { surface: "capture", source: "image" });
      const ok = await stashPendingImport({ kind: "images", images, label: imageLabel(files) });
      router.push("/print");
      if (!ok) setBusy(false);
    } catch (err) {
      setBusy(false);
      // Only ImportError carries a sentence written for a cook. Anything else
      // reaching here is an unexpected throw, and its `message` is a developer
      // string; this was the one place in the app that would have shown one.
      setError(
        err instanceof ImportError
          ? err.message
          : "Couldn't read those images. Try different files.",
      );
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
            Recipe link
          </label>
          {/* Same row shape as the workspace importer (see ImportPanel): the
              button centres against the taller field, and the error sits below
              the row so it can't push that centre around. */}
          <div className="flex flex-col gap-cp-4 lg:flex-row lg:items-center lg:gap-cp-2">
            <input
              id="seo-url"
              /* `text`, not `url` — see the same note in ImportPanel. The
                 comment in `handleSubmit` below explains at length why a bare
                 domain and a wrapped link have to get through; the browser's
                 own check was turning both away before any of that ran, on the
                 pages carrying the organic traffic. */
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              className="field w-full lg:flex-1"
              placeholder={placeholder ?? "Paste recipe link here"}
              value={url}
              onChange={(e) => {
                warmWorkspace();
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
              warmWorkspace();
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
