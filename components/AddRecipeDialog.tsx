"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportTab } from "@/types/recipe";
import { ImportPanel } from "@/components/ImportPanel";
import { ICON_SIZE, XIcon } from "@/components/icons";
import { Dialog } from "@/components/Dialog";
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
}) {
  /** Filled in by the import panel; lets Add finish the entry in the form. */
  const commitImportRef = useRef<(() => boolean) | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  /** A URL field needs one line; a paste box and a dropzone need a dialog. */
  const [mode, setMode] = useState<ImportTab>("url");
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


  function clearDuplicate() {
    if (duplicateTitle) setDuplicateTitle(null);
  }

  function handleAddUrl(url: string) {
    clearDuplicate();
    onAddUrl(url);
  }

  function handleAddImageFiles(files: File[], label: string) {
    clearDuplicate();
    onAddImageFiles(files, label);
  }

  function handleAddText(text: string) {
    clearDuplicate();
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
          hideSubmit
          showAllModes
          onModeChange={setMode}
          items={items}
          onAddUrl={handleAddUrl}
          onAddImageFiles={handleAddImageFiles}
          onAddText={handleAddText}
          onAddReadyRecipes={onAddReadyRecipes}
          onRemoveRecipe={() => undefined}
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
