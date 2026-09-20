"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ICON_SIZE, SpinnerIcon, UploadIcon } from "@/components/icons";
import { ImportPanel } from "@/components/ImportPanel";
import { stashPendingImport } from "@/lib/pendingImport";
import { imageLabel, partitionImageFiles, validateImageFiles } from "@/lib/imageImport";
import { normalizeImportURL } from "@/lib/cookpilot";
import { track } from "@/lib/analytics";
import type { ImportTab, QueueItem } from "@/types/recipe";

// Only the Paprika pages render this, but a static import put it in every SEO
// page's bundle. Its `useSingleRecipeOnly` reaches CookPilotAuth (Firebase Auth
// and its IndexedDB persistence) and the purchase code, none of which a visitor
// on a URL, photo or paste page ever runs. Still server-rendered, on purpose:
// it is the dropzone above the fold on the pages that do use it, so there is
// no loading state to flash and the HTML arrives complete.
const PaprikaCapture = dynamic(() =>
  import("@/components/seo/PaprikaCapture").then((mod) => mod.PaprikaCapture),
);

// A deliberately minimal capture for the SEO landing pages: just the one input
// that matches the page's intent (a URL field, a paste box, or a photo dropzone)
// plus an import button, no mode toggle, no other options. On submit it stashes
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
// This whole single-field path is skipped when `modes` names more than one
// source — see the component below.
type CaptureMode = "url" | "text" | "image";

function resolveMode(tab?: ImportTab): CaptureMode {
  if (tab === "text") return "text";
  if (tab === "image") return "image";
  return "url";
}

/**
 * Hands a stashed payload to `/print`, which finishes the import — shared by
 * both branches below (the lightweight single-field form and the full
 * ImportPanel switch), and the same shape PrinterWorkspace's own `handoff`
 * uses for the homepage. Kept here rather than duplicated in each branch.
 */
function useHandoff() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handoff(payload: Parameters<typeof stashPendingImport>[0]) {
    setBusy(true);
    track("recipe_import_submitted", {
      surface: "capture",
      source:
        payload.kind === "images" || payload.kind === "imageFiles"
          ? "image"
          : payload.kind === "text"
            ? "text"
            : payload.kind === "ready"
              ? (payload.recipes[0]?.method ?? "manual")
              : "url",
    });
    const ok = await stashPendingImport(payload);
    // Even if persistence failed (private mode, quota), send them to the working
    // tool rather than stranding them on the landing page.
    router.push("/print");
    if (!ok) setBusy(false);
  }

  return { router, busy, setBusy, handoff };
}

export function SeoCapture({
  initialMode = "url",
  submitLabel = "Start printing",
  fieldLabel,
  placeholder,
  modes,
}: {
  initialMode?: ImportTab;
  submitLabel?: string;
  /**
   * What the field is called, when the page can say it more precisely than the
   * generic mode name.
   *
   * The default names the KIND of thing the box takes, which is all a page
   * showing every input could say. A page about one source knows better: on the
   * Instagram page "Recipe link" is a box that could be for anything, and
   * "Instagram link" is an answer to the question the visitor arrived with. It
   * also quietly rules a source in — someone holding a Reel URL, unsure whether
   * that counts as a recipe link, can stop wondering.
   *
   * Only read on the single-field path — a page showing every source (see
   * `modes`) is inherently general, so ImportPanel's own generic copy applies.
   */
  fieldLabel?: string;
  placeholder?: string;
  /**
   * Which sources this page offers. Defaults to just `initialMode` — the
   * deliberately minimal single field every existing page keeps, since a page
   * written around one search phrase (Pinterest, a photo, a paste) answering
   * with every other mode too is a box nobody who searched that phrase asked
   * for. Name two or more and this renders the real ImportPanel switch — the
   * same Link / Recipe apps / Image / Text control the homepage and the
   * Add-recipe dialog use — restricted to the sources listed, instead of a
   * second implementation of the same picker.
   */
  modes?: ImportTab[];
}) {
  const singleMode = !modes || modes.length <= 1 ? (modes?.[0] ?? initialMode) : null;

  if (singleMode === "apps") return <PaprikaFileCapture />;

  if (singleMode) {
    return (
      <SingleFieldCapture
        mode={resolveMode(singleMode)}
        submitLabel={submitLabel}
        fieldLabel={fieldLabel}
        placeholder={placeholder}
      />
    );
  }

  return (
    <FullCapture initialMode={initialMode} submitLabel={submitLabel} modes={modes ?? undefined} />
  );
}

/** Keep file reading and recipe selection here until the visitor commits. */
function PaprikaFileCapture() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handoff(recipes: QueueItem[]) {
    setBusy(true);
    setError(null);
    track("recipe_import_submitted", { surface: "capture", source: "paprika" });
    if (!(await stashPendingImport({ kind: "ready", recipes }))) {
      setBusy(false);
      setError("We couldn't open that recipe. Please try again.");
      return;
    }
    router.push("/print");
  }

  return (
    <>
      <PaprikaCapture
        busy={busy}
        onAddRecipes={(recipes) => {
          if (busy || recipes.length === 0) return 0;
          void handoff(recipes);
          return recipes.length;
        }}
      />
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}

/** The multi-source switch — a thin adapter over the shared ImportPanel,
    wired to stash-and-redirect instead of adding to a live queue (there is
    none here; every landing page hands off to `/print` the moment something
    validates). */
function FullCapture({
  initialMode,
  submitLabel,
  modes,
}: {
  initialMode: ImportTab;
  submitLabel: string;
  modes: ImportTab[] | undefined;
}) {
  const { busy, handoff } = useHandoff();

  return (
    // No reserved min-height here on purpose. That was the original fix for
    // the hero photo jumping as the mode changed height — it worked, but it
    // also left dead space below every shorter mode, pushing whatever comes
    // after this (the reassurance line) down with it. The real fix is the
    // page passing `asideAlign: "center-once"` to LandingHero (see
    // HeroSplitRow): the photo's position is measured once after mount and
    // frozen, so it doesn't depend on this column's height after that, and
    // there's nothing left to reserve against.
    <ImportPanel
      // Always empty, and that is the point: this page holds no print list,
      // so nothing can be marked as already added and every enabled source
      // stays on show — see PrinterWorkspace, which does the same.
      items={[]}
      workspace
      modes={modes}
      initialMode={initialMode}
      submitLabel={submitLabel}
      submitBusy={busy}
      autoFocusUrl={false}
      onAddUrl={(url) => void handoff({ kind: "url", url })}
      onAddText={(text) => void handoff({ kind: "text", text })}
      onAddImageFiles={(files, label) => void handoff({ kind: "imageFiles", files, label })}
      onAddReadyRecipes={(recipes: QueueItem[]) => {
        if (recipes.length === 0) return 0;
        void handoff({ kind: "ready", recipes });
        return recipes.length;
      }}
    />
  );
}

/** The original one-field capture, unchanged in behavior: a URL field, a
    paste box, or a photo dropzone, matching whichever single mode the page
    was given. */
function SingleFieldCapture({
  mode,
  submitLabel,
  fieldLabel,
  placeholder,
}: {
  mode: CaptureMode;
  submitLabel: string;
  fieldLabel?: string;
  placeholder?: string;
}) {
  const { router, busy, setBusy, handoff } = useHandoff();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const warmedRef = useRef(false);

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
    // Validated here and decoded on /print — see the `imageFiles` payload in
    // lib/pendingImport.ts. A landing page has even less standing than the home
    // page to hold someone through a libheif transcode: it is a page they came
    // to read, and the workspace they are being sent to is the thing that can
    // show a photo being worked on.
    const validationError = validateImageFiles(files);
    if (validationError) return setError(validationError.message);
    return handoff({ kind: "imageFiles", files, label: imageLabel(files) });
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
            {fieldLabel ?? "Recipe link"}
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
          <FieldError error={error} />
        </div>
      )}

      {mode === "text" && (
        <>
          <label htmlFor="seo-text" className="field-label">
            {fieldLabel ?? "Recipe text"}
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
          <FieldError error={error} />
          {submitButton}
        </>
      )}

      {mode === "image" && (
        <>
          <span className="field-label">{fieldLabel ?? "Recipe photos"}</span>
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
          <FieldError error={error} />
          {submitButton}
        </>
      )}
    </form>
  );
}

/**
 * Same slot whether or not there's an error to show. Left unreserved, an
 * error appearing or clearing changes this column's height, and the hero
 * grid it sits in (`LandingHero`'s default `items-center`) re-centers the
 * whole row against that — which reads as the product photo beside it
 * jumping for a reason that has nothing to do with the photo.
 */
function FieldError({ error }: { error: string | null }) {
  return (
    <p className={`field-error ${error ? "" : "invisible"}`} role="alert" aria-hidden={error ? undefined : true}>
      {error || " "}
    </p>
  );
}
