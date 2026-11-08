"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportTab } from "@/types/recipe";
import { IMAGE_SUBMIT_LABEL, ImportPanel } from "@/components/ImportPanel";
import { MenuSelect } from "@/components/MenuSelect";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { Dialog } from "@/components/Dialog";
import { track } from "@/lib/analytics";
import type { QueueItem } from "@/types/recipe";

// A lighter version of the homepage's import panel, for adding to a print job
// or a cookbook without leaving the deck.
//
// One action: the panel's own submit is hidden and the footer's Add drives it,
// so there is no Add-then-Done pair to tell apart. It used to stay open and
// keep a running list of what had been added, which was the deck's own rail
// rebuilt inside the dialog that was covering it.
export function AddRecipeDialog({
  open,
  onClose,
  items,
  onAddUrl,
  onAddImageFiles,
  onAddText,
  onAddReadyRecipes,
  lastSource,
  onSourceUsed,
  libraryLocked = false,
  librarySingleSelect = false,
  onLibraryLockedTap,
  chapterTarget,
  title = "Add recipes",
}: {
  open: boolean;
  onClose: () => void;
  items: QueueItem[];
  onAddUrl: (url: string) => void;
  onAddImageFiles: (files: File[], label: string) => void;
  onAddText: (text: string) => void;
  onAddReadyRecipes: (recipes: QueueItem[]) => number;
  /** The source this project was last filled from, and therefore the one this
      opens on. See `PrintProjectSettings.lastImportSource`. */
  lastSource: ImportTab;
  /** A recipe was actually added from this source. Only an add reports — see
      `setLastImportSource`. */
  onSourceUsed: (source: ImportTab) => void;
  /** See `ImportPanel`'s own `libraryLocked` doc. */
  libraryLocked?: boolean;
  /** See `ImportPanel`'s own `librarySingleSelect` doc. */
  librarySingleSelect?: boolean;
  /** Opens the Pro upgrade dialog — only ever called while `libraryLocked`. */
  onLibraryLockedTap?: () => void;
  /**
   * Which chapter the recipe goes into, shown so the cook can see it and
   * change it. Without this, where a recipe landed depended on the page that
   * happened to be on screen, which nothing ever said. Absent for a book with
   * no chapters, where there is nothing to choose.
   */
  chapterTarget?: {
    options: { id: string; label: string }[];
    value: string | null;
    onChange: (sectionId: string) => void;
  };
  /** "Add your first recipe" when opened from the cookbook welcome. */
  title?: string;
}) {
  /** Filled in by the import panel; lets Add finish the entry in the form. */
  const commitImportRef = useRef<(() => boolean | Promise<boolean>) | null>(null);
  /** Done is adding the recipes ticked in a library, which takes a moment. */
  const [finishing, setFinishing] = useState(false);
  /** A URL field needs one line; a paste box and a dropzone need a dialog. */
  const [mode, setMode] = useState<ImportTab>(lastSource);
  /**
   * The recipe-app sources have no form to submit: Done adds whatever is ticked
   * in the open library and closes, so there is no Add-then-Done pair there
   * either. It says Done because nothing ticked is a plain close.
   *
   * It used to drop the footer entirely, on the reasoning that an Add which
   * adds nothing is a lie. True, but the fix was the wrong half: every other
   * tab ends in a full-width button along the bottom, and taking it away left
   * that one tab with no way out but the small X in the corner, and no signal
   * that anything had been finished. The button belongs there; what it says is
   * what needed to change.
   */
  const addsOnPick = mode === "apps";
  /**
   * Put the mirror back to what the sheet will next OPEN on.
   *
   * `mode` is a mirror of the panel's own tab, kept only so the sheet AROUND
   * the panel can be styled — the paste box needs a taller one. But the panel
   * lives inside `Dialog`, which renders nothing while closed, so it remounts
   * on the way back in and takes its tab from `initialMode` afresh, while this
   * copy still said whatever was last chosen.
   *
   * Reopening after using Text therefore dressed the sheet as the paste box
   * around a Link field, and `.recipe-add-dialog__panel--paste .field` stretched
   * the one-line URL input to the paste box's full 340px. The fix is not that
   * neither survives the close — it is that both land on the same answer, and
   * the answer is `lastSource`, which is also what the panel remounts with.
   */
  useEffect(() => {
    if (!open) setMode(lastSource);
  }, [open, lastSource]);

  /* Which door this import came through, for `recipe_import_submitted`. Every
     import now finishes on this page, so the event's own `$current_url` cannot
     tell this dialog apart from the paste field at the end of the rail, or from
     a handoff off the home page. */
  function handleAddUrl(url: string) {
    track("recipe_import_submitted", { surface: "dialog", source: "url" });
    onSourceUsed("url");
    onAddUrl(url);
  }

  function handleAddImageFiles(files: File[], label: string) {
    track("recipe_import_submitted", { surface: "dialog", source: "image" });
    onSourceUsed("image");
    onAddImageFiles(files, label);
  }

  function handleAddText(text: string) {
    track("recipe_import_submitted", { surface: "dialog", source: "text" });
    onSourceUsed("text");
    onAddText(text);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="recipe-add-dialog-title"
      className="recipe-add-dialog no-print"
      backdropClassName="recipe-add-dialog__backdrop"
      panelClassName={`recipe-add-dialog__panel ${
        mode === "text" ? "recipe-add-dialog__panel--paste" : ""
      }`}
    >
      <div className="recipe-add-dialog__header">
        <h2 id="recipe-add-dialog-title">{title}</h2>
        <button
          type="button"
          className="recipe-add-dialog__close icon-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      <div className="recipe-add-dialog__body">
        {chapterTarget && (
          <div className="recipe-add-dialog__target">
            <MenuSelect
              label="Adding to"
              placeholder="Choose a chapter"
              value={chapterTarget.value}
              options={chapterTarget.options.map((option) => ({ value: option.id, label: option.label }))}
              onChange={(value) => {
                if (value !== null) chapterTarget.onChange(value);
              }}
            />
          </div>
        )}
        <ImportPanel
          commitRef={commitImportRef}
          onSubmitted={onClose}
          hideSubmit
          showAllModes
          /* Read once per open: `Dialog` renders nothing while closed, so the
             panel is a fresh mount every time the sheet appears. */
          initialMode={lastSource}
          onModeChange={setMode}
          items={items}
          onAddUrl={handleAddUrl}
          onAddImageFiles={handleAddImageFiles}
          onAddText={handleAddText}
          onAddReadyRecipes={(recipes) => {
            if (recipes.length > 0) {
              track("recipe_import_submitted", {
                surface: "dialog",
                source: recipes[0]!.method,
              });
              // The recipe-app sources add from their own lists, on Done, so
              // this is their equivalent of the three handlers above.
              onSourceUsed("apps");
            }
            return onAddReadyRecipes(recipes);
          }}
          libraryLocked={libraryLocked}
          librarySingleSelect={librarySingleSelect}
          onLibraryLockedTap={onLibraryLockedTap}
        />

      </div>

      {/* One action. The panel's own submit is hidden (`hideSubmit`) and this
          button drives it, so there is no "Add, then Done" pair to work out
          the difference between: adding IS finishing. Whatever is happening to
          the recipe afterwards shows on the deck this dialog was covering.

          `commitImportRef` no-ops when there is nothing uncommitted. On the
          recipe-apps tab it adds what is ticked in the open library, and
          answers `false` if some of it did not come over, so the message
          saying so stays on screen.

          It answers `false` when the panel refused what was in the form — an
          unreadable photo, a link that isn't one. Closing over that message was
          how a photo we would not accept came to look like one we had: the
          dialog went away, and nothing anywhere said no. */}
      <div className="recipe-add-dialog__footer">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={finishing}
          onClick={async () => {
            const result = commitImportRef.current?.();
            if (result instanceof Promise) {
              setFinishing(true);
              let ok = false;
              try {
                ok = await result;
              } finally {
                setFinishing(false);
              }
              if (!ok) return;
            } else if (result === false) {
              return;
            }
            onClose();
          }}
        >
          {finishing && <SpinnerIcon size={ICON_SIZE.md} />}
          {addsOnPick
            ? "Done"
            : mode === "image"
              ? IMAGE_SUBMIT_LABEL
              : "Add"}
        </button>
      </div>
    </Dialog>
  );
}
