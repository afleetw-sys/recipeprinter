"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportTab } from "@/types/recipe";
import { ImportPanel } from "@/components/ImportPanel";
import { ICON_SIZE, XIcon } from "@/components/icons";
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
  focusedItemId,
  focusNonce,
  onAddUrl,
  onAddImageFiles,
  onAddText,
  onAddReadyRecipes,
  lastSource,
  onSourceUsed,
  libraryLocked = false,
  librarySingleSelect = false,
  onLibraryLockedTap,
}: {
  open: boolean;
  onClose: () => void;
  items: QueueItem[];
  /** Set by the queue when an import matched a recipe that's already here. */
  focusedItemId: string | null;
  focusNonce: number;
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
}) {
  /** Filled in by the import panel; lets Add finish the entry in the form. */
  const commitImportRef = useRef<(() => boolean) | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  /** A URL field needs one line; a paste box and a dropzone need a dialog. */
  const [mode, setMode] = useState<ImportTab>(lastSource);
  /**
   * The recipe-app sources have no form to submit: they add on pick, straight
   * from their own lists. So that tab's button finishes rather than adds.
   *
   * It used to drop the footer entirely, on the reasoning that an Add which
   * adds nothing is a lie. True, but the fix was the wrong half: every other
   * tab ends in a full-width button along the bottom, and taking it away left
   * that one tab with no way out but the small X in the corner, and no signal
   * that anything had been finished. The button belongs there; what it says is
   * what needed to change.
   */
  const addsOnPick = mode === "apps";
  const seenFocusNonceRef = useRef(focusNonce);

  // A re-import of something already in the job doesn't add a second copy —
  // the queue focuses the existing one and bumps `focusNonce`. On the deck
  // that shows up as a shake on the rail row, which this dialog is sitting on
  // top of, so say it here instead of letting the submit look ignored.
  useEffect(() => {
    if (!open || focusNonce === seenFocusNonceRef.current) return;
    seenFocusNonceRef.current = focusNonce;
    const existing = items.find((item) => item.id === focusedItemId);
    setDuplicateTitle(existing?.title || "That recipe");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, open]);


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
   *
   * The duplicate banner rides along for the same reason: it is keyed to
   * whatever import last matched, not to what's currently on screen, so a
   * stale "already in this project" line could otherwise sit under an
   * unrelated tab after a close/reopen.
   */
  useEffect(() => {
    if (!open) {
      setMode(lastSource);
      setDuplicateTitle(null);
    }
  }, [open, lastSource]);

  function clearDuplicate() {
    if (duplicateTitle) setDuplicateTitle(null);
  }

  /* Which door this import came through, for `recipe_import_submitted`. Every
     import now finishes on this page, so the event's own `$current_url` cannot
     tell this dialog apart from the paste field at the end of the rail, or from
     a handoff off the home page. */
  function handleAddUrl(url: string) {
    clearDuplicate();
    track("recipe_import_submitted", { surface: "dialog", source: "url" });
    onSourceUsed("url");
    onAddUrl(url);
  }

  function handleAddImageFiles(files: File[], label: string) {
    clearDuplicate();
    track("recipe_import_submitted", { surface: "dialog", source: "image" });
    onSourceUsed("image");
    onAddImageFiles(files, label);
  }

  function handleAddText(text: string) {
    clearDuplicate();
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
        <h2 id="recipe-add-dialog-title">Add recipes</h2>
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
        <ImportPanel
          commitRef={commitImportRef}
          onSubmitted={onClose}
          hideSubmit
          showAllModes
          /* Read once per open: `Dialog` renders nothing while closed, so the
             panel is a fresh mount every time the sheet appears. */
          initialMode={lastSource}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            clearDuplicate();
          }}
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
              // The recipe-app sources add on pick rather than on submit, so
              // this is their equivalent of the three handlers above.
              onSourceUsed("apps");
            }
            return onAddReadyRecipes(recipes);
          }}
          libraryLocked={libraryLocked}
          librarySingleSelect={librarySingleSelect}
          onLibraryLockedTap={onLibraryLockedTap}
        />

        {duplicateTitle && (
          <p className="recipe-add-dialog__duplicate" role="status">
            {duplicateTitle} is already in this project.
          </p>
        )}

      </div>

      {/* One action. The panel's own submit is hidden (`hideSubmit`) and this
          button drives it, so there is no "Add, then Done" pair to work out
          the difference between: adding IS finishing. Whatever is happening to
          the recipe afterwards shows on the deck this dialog was covering.

          `commitImportRef` no-ops when there is nothing uncommitted, which is
          always the case on the recipe-apps tab, so the same handler serves
          both labels.

          It answers `false` when the panel refused what was in the form — an
          unreadable photo, a link that isn't one. Closing over that message was
          how a photo we would not accept came to look like one we had: the
          dialog went away, and nothing anywhere said no. */}
      <div className="recipe-add-dialog__footer">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            if (commitImportRef.current?.() === false) return;
            onClose();
          }}
        >
          {addsOnPick ? "Done" : "Add"}
        </button>
      </div>
    </Dialog>
  );
}
