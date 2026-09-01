"use client";

import { useEffect, useState } from "react";
import { ICON_SIZE, TrashIcon, XIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const COFFEE_LOGO_SRC = "/images/buy-me-a-coffee-logo.png";

export function PrintDialogs({
  showDonateDialog,
  onCloseDonateDialog,
  onOpenFeedbackDialog,
  showDeleteRecipeDialog,
  deleteItemTitle,
  deleteItemDescription,
  deletePrimaryLabel,
  sectionRecipeCount,
  onCancelDeleteRecipe,
  onConfirmDeleteRecipe,
  onConfirmDeleteSectionRecipes,
}: {
  showDonateDialog: boolean;
  onCloseDonateDialog: () => void;
  onOpenFeedbackDialog: () => void;
  showDeleteRecipeDialog: boolean;
  deleteItemTitle: string;
  deleteItemDescription: string;
  deletePrimaryLabel?: string;
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
            <div className="print-success-dialog__icon" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/recipeprinter-logo.png"
                alt=""
                className="print-success-dialog__logo"
                width={58}
                height={58}
              />
            </div>
            <h2 id="print-success-title">Ready for your counter, binder, or fridge door.</h2>
            <p>Support and feedback help me make RecipePrinter better.</p>
            {/* Quieter action left, primary right — the order every dialog
                in the app reads in. */}
            <div className="print-success-dialog__actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onCloseDonateDialog();
                  onOpenFeedbackDialog();
                }}
              >
                Leave feedback
              </button>
              <a
                href={COFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={COFFEE_LOGO_SRC}
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5 rounded-full"
                  width={20}
                  height={20}
                />
                Support RecipePrinter
              </a>
            </div>
      </Dialog>
      {/* The shared confirm, not a second one built on the panel above. */}
      <ConfirmDialog
        open={showDeleteRecipeDialog}
        title={`Delete ${deleteItemTitle}?`}
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
