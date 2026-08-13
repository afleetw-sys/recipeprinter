"use client";

import { useEffect, useRef, useState } from "react";
import { ICON_SIZE, TrashIcon, XIcon } from "@/components/icons";
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
  showExitCookbookDialog,
  onCancelExitCookbook,
  onConfirmExitCookbook,
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
  showExitCookbookDialog: boolean;
  onCancelExitCookbook: () => void;
  onConfirmExitCookbook: () => void;
}) {
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [alsoDeleteSectionRecipes, setAlsoDeleteSectionRecipes] = useState(false);
  const showSectionRecipeCheckbox =
    sectionRecipeCount !== undefined && sectionRecipeCount > 0 && Boolean(onConfirmDeleteSectionRecipes);
  // Runs after the Dialog's own mount-time focus (which grabs the first
  // focusable element — the X close button) so Enter defaults to actually
  // deleting rather than just closing, per the request that drove this dialog.
  useEffect(() => {
    if (showDeleteRecipeDialog) deleteButtonRef.current?.focus();
  }, [showDeleteRecipeDialog]);
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
            <div className="print-success-dialog__actions">
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
            </div>
      </Dialog>
      <Dialog
        open={showDeleteRecipeDialog}
        onClose={onCancelDeleteRecipe}
        labelledBy="recipe-delete-title"
        className="print-success-dialog no-print"
        backdropClassName="print-success-dialog__backdrop"
        panelClassName="print-success-dialog__panel"
      >
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCancelDeleteRecipe}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="recipe-delete-title">Delete {deleteItemTitle}?</h2>
            <p>{deleteItemDescription}</p>
            {showSectionRecipeCheckbox && (
              <label className="print-success-dialog__checkbox">
                <input
                  type="checkbox"
                  checked={alsoDeleteSectionRecipes}
                  onChange={(event) => setAlsoDeleteSectionRecipes(event.target.checked)}
                />
                <span>
                  Also delete the {sectionRecipeCount} recipe{sectionRecipeCount === 1 ? "" : "s"} in this section
                </span>
              </label>
            )}
            <div className="print-success-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={onCancelDeleteRecipe}>
                Cancel
              </button>
              <button
                ref={deleteButtonRef}
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
              >
                <TrashIcon size={ICON_SIZE.md} />
                {deletePrimaryLabel ?? "Delete"}
              </button>
            </div>
      </Dialog>
      {/* Switching back to recipe cards is non-destructive now: the book is
          tucked away (see `exitCookbook`/`restoreCookbook` in lib/project.ts)
          and comes back intact on the next switch. So this is a light "sure you
          don't want a cookbook?" nudge, not a data-loss warning. */}
      <Dialog
        open={showExitCookbookDialog}
        onClose={onCancelExitCookbook}
        labelledBy="exit-cookbook-title"
        className="print-success-dialog no-print"
        backdropClassName="print-success-dialog__backdrop"
        panelClassName="print-success-dialog__panel"
      >
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCancelExitCookbook}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="exit-cookbook-title">Switch back to recipe cards?</h2>
            <p>
              Your cookbook is saved either way, so you can switch back anytime and pick up right
              where you left off.
            </p>
            <div className="print-success-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={onCancelExitCookbook}>
                Never mind
              </button>
              <button type="button" className="btn btn-secondary" onClick={onConfirmExitCookbook}>
                Switch to recipe cards
              </button>
            </div>
      </Dialog>
    </>
  );
}
