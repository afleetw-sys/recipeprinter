"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportMethod } from "@/types/recipe";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
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
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
}: {
  open: boolean;
  onClose: () => void;
  items: QueueItem[];
  /** Set by the queue when an import matched a recipe that's already here. */
  focusedItemId: string | null;
  focusNonce: number;
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
}) {
  /** Filled in by the import panel; lets Add finish the entry in the form. */
  const commitImportRef = useRef<(() => boolean) | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  /** A URL field needs one line; a paste box and a dropzone need a dialog. */
  const [mode, setMode] = useState<ImportMethod>("url");
  const { user: cookPilotUser } = useCookPilotAuth();
  /**
   * CookPilot signed out shows a sign-in prompt, not a form — there is nothing
   * for Add to submit, so offering it is offering a button that does nothing.
   * Recipes chosen from a signed-in CookPilot library add themselves on pick.
   */
  const canAdd = mode !== "cookpilot" || Boolean(cookPilotUser);
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

  function handleAddImages(images: string[], label: string) {
    clearDuplicate();
    onAddImages(images, label);
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
        mode === "text" || mode === "image" ? "recipe-add-dialog__panel--roomy" : ""
      } ${mode === "text" ? "recipe-add-dialog__panel--paste" : ""}`}
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
          onModeChange={setMode}
          items={items}
          onAddUrl={handleAddUrl}
          onAddImages={handleAddImages}
          onAddText={handleAddText}
          onAddCookPilotRecipes={onAddCookPilotRecipes}
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
          the recipe afterwards shows on the deck this dialog was covering. */}
      {canAdd && (
      <div className="recipe-add-dialog__footer">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            commitImportRef.current?.();
            onClose();
          }}
        >
          Add
        </button>
      </div>
      )}
    </Dialog>
  );
}
