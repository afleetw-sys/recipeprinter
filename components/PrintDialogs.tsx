"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, ICON_SIZE, SwapIcon, TrashIcon, XIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";

export function PrintDialogs({
  showDonateDialog,
  onCloseDonateDialog,
  onOpenFeedbackDialog,
  onSwapRecipe,
  showDeleteRecipeDialog,
  deleteItemTitle,
  deleteItemDescription,
  deletePrimaryLabel,
  deleteVerb = "Delete",
  sectionRecipeCount,
  onCancelDeleteRecipe,
  onConfirmDeleteRecipe,
  onConfirmDeleteSectionRecipes,
}: {
  showDonateDialog: boolean;
  onCloseDonateDialog: () => void;
  onOpenFeedbackDialog: () => void;
  /** The dialog's main action: leave for a fresh recipe. */
  onSwapRecipe: () => void;
  showDeleteRecipeDialog: boolean;
  deleteItemTitle: string;
  deleteItemDescription: string;
  deletePrimaryLabel?: string;
  /** The title's verb. "Remove" for a book's optional pages, which come back
      from the page list; everything else is a Delete. */
  deleteVerb?: "Delete" | "Remove";
  sectionRecipeCount?: number;
  onCancelDeleteRecipe: () => void;
  onConfirmDeleteRecipe: () => void;
  onConfirmDeleteSectionRecipes?: () => void;
}) {
  const [alsoDeleteSectionRecipes, setAlsoDeleteSectionRecipes] = useState(false);
  const showSectionRecipeCheckbox =
    sectionRecipeCount !== undefined && sectionRecipeCount > 0 && Boolean(onConfirmDeleteSectionRecipes);
  useEffect(() => {
    if (showDeleteRecipeDialog) setAlsoDeleteSectionRecipes(false);
  }, [showDeleteRecipeDialog, sectionRecipeCount]);

  function confirmDelete() {
    if (showSectionRecipeCheckbox && alsoDeleteSectionRecipes && onConfirmDeleteSectionRecipes) {
      onConfirmDeleteSectionRecipes();
      return;
    }
    onConfirmDeleteRecipe();
  }

  return (
    <>
      <Dialog
        open={showDonateDialog}
        onClose={onCloseDonateDialog}
        labelledBy="print-success-title"
        className="print-success-dialog no-print"
        backdropClassName="print-success-dialog__backdrop"
        panelClassName="print-success-dialog__panel"
      >
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseDonateDialog}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            {/* After the first card goes out: an invitation to make the next
                one, so one recipe becomes a habit (Amelia, 2026-11-10). It
                replaced "Ready for your counter, binder, or fridge door" with
                its single Leave feedback button; feedback is still here, as
                the quiet link at the bottom. */}
            <div className="another-recipe__heading">
              <CheckCircleIcon size={22} className="another-recipe__check" />
              <h2 id="print-success-title">Another recipe?</h2>
            </div>
            <p>Print a different recipe in the same theme and size.</p>
            <div className="another-recipe__actions">
              <button type="button" className="btn btn-primary w-full" onClick={onSwapRecipe}>
                <SwapIcon size={ICON_SIZE.md} />
                Print another
              </button>
              <button
                type="button"
                className="another-recipe__feedback"
                onClick={() => {
                  onCloseDonateDialog();
                  onOpenFeedbackDialog();
                }}
              >
                Share feedback
              </button>
            </div>
      </Dialog>
      {/* The shared confirm, not a second one built on the panel above. */}
      <ConfirmDialog
        open={showDeleteRecipeDialog}
        title={`${deleteVerb} ${deleteItemTitle}?`}
        description={deleteItemDescription}
        confirmLabel={deletePrimaryLabel ?? "Delete"}
        confirmIcon={<TrashIcon size={ICON_SIZE.md} />}
        autoFocusConfirm
        onCancel={onCancelDeleteRecipe}
        onConfirm={confirmDelete}
      >
        {showSectionRecipeCheckbox && (
          <label className="confirm-dialog__checkbox">
            <input
              type="checkbox"
              checked={alsoDeleteSectionRecipes}
              onChange={(event) => setAlsoDeleteSectionRecipes(event.target.checked)}
            />
            <span>
              Also delete the {sectionRecipeCount} recipe{sectionRecipeCount === 1 ? "" : "s"} in this chapter
            </span>
          </label>
        )}
      </ConfirmDialog>
      {/* The "switch back to recipe cards?" confirm lived here. It is gone:
          before a book is bought the switch is reversible exploration and has
          nothing to warn about, and once bought there is no switch at all —
          leaving is an explicit "New recipe cards" action that forks a
          separate project. See `renderModeSwitch` in app/print/page.tsx. */}
    </>
  );
}
