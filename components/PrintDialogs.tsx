"use client";

import { useEffect, useRef, useState } from "react";
import { BookIcon, CheckIcon, ICON_SIZE, SpinnerIcon, TrashIcon, XIcon } from "@/components/icons";
import { Dialog } from "@/components/Dialog";
import { COOKBOOK_BENEFITS } from "@/lib/cookbookProduct";
import { COOKBOOK_PRESETS, PRINTERS } from "@/lib/cookbookPresets";
import { track } from "@/lib/analytics";
import type { CookbookPresetId } from "@/types/recipe";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const COFFEE_LOGO_SRC = "/images/buy-me-a-coffee-logo.png";

function CookbookBenefitsList() {
  return (
    <ul className="cookbook-benefits">
      {COOKBOOK_BENEFITS.map((benefit) => (
        <li key={benefit}>
          <CheckIcon size={ICON_SIZE.sm} />
          {benefit}
        </li>
      ))}
    </ul>
  );
}

export function PrintDialogs({
  showDonateDialog,
  onCloseDonateDialog,
  onOpenFeedbackDialog,
  showCookbookUnlockDialog,
  onCloseCookbookUnlockDialog,
  cookbookPrice,
  cookbookPurchaseBusy,
  onUnlockCookbook,
  showCookbookPrintDialog,
  cookbookJustPurchased,
  onCloseCookbookPrintDialog,
  onExportFormat,
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
  showCookbookUnlockDialog: boolean;
  onCloseCookbookUnlockDialog: () => void;
  cookbookPrice: string;
  cookbookPurchaseBusy: boolean;
  onUnlockCookbook: () => void;
  showCookbookPrintDialog: boolean;
  /** True the first time this screen opens right after purchase, so it leads
      with a one-time celebration instead of the plain re-export framing. */
  cookbookJustPurchased: boolean;
  onCloseCookbookPrintDialog: () => void;
  /** Export the cookbook at the chosen format — flips on that format's print
      geometry and re-opens the browser Save-as-PDF dialog. */
  onExportFormat: (presetId: CookbookPresetId) => void;
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
        open={showCookbookUnlockDialog}
        onClose={onCloseCookbookUnlockDialog}
        closeDisabled={cookbookPurchaseBusy}
        labelledBy="cookbook-unlock-title"
        className="print-success-dialog no-print"
        backdropClassName="print-success-dialog__backdrop"
        panelClassName="print-success-dialog__panel"
      >
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseCookbookUnlockDialog}
              disabled={cookbookPurchaseBusy}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="cookbook-unlock-title">Purchase your cookbook — {cookbookPrice}</h2>
            <p>
              A one-time purchase — your recipes become a professionally designed cookbook, yours
              to re-export forever. Checkout will ask for your email, and afterward you can protect
              access on other devices with a free account.
            </p>
            <CookbookBenefitsList />
            <div className="print-success-dialog__actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={cookbookPurchaseBusy}
                onClick={onUnlockCookbook}
              >
                {cookbookPurchaseBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <BookIcon size={ICON_SIZE.md} />}
                Purchase & Export
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onCloseCookbookUnlockDialog}
                disabled={cookbookPurchaseBusy}
              >
                Not now
              </button>
            </div>
      </Dialog>
      {/* Shown right after purchase (and whenever an unlocked cookbook is
          exported) — NOT from `afterprint`, which can't tell whether the user
          saved, printed, or cancelled. The format is chosen HERE at download
          time: the $19.99 unlocks every format forever, so each button exports
          that format via the browser's Save-as-PDF. Printer links are
          recommendations only, with no fulfillment or checkout. */}
      <Dialog
        open={showCookbookPrintDialog}
        onClose={onCloseCookbookPrintDialog}
        labelledBy="cookbook-print-title"
        className="print-success-dialog no-print"
        backdropClassName="print-success-dialog__backdrop"
        panelClassName="print-success-dialog__panel"
      >
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseCookbookPrintDialog}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <div className="print-success-dialog__icon" aria-hidden>
              <BookIcon size={30} />
            </div>
            {cookbookJustPurchased ? (
              <>
                <h2 id="cookbook-print-title">Your cookbook is ready 🎉</h2>
                <p>
                  Nicely done — it&apos;s unlocked and yours forever. Pick a format to save as a
                  PDF; you can export every format, as many times as you like.
                </p>
              </>
            ) : (
              <>
                <h2 id="cookbook-print-title">Print your cookbook</h2>
                <p>Choose a format to save as a PDF — you have access to all of them, anytime.</p>
              </>
            )}
            <div className="cookbook-print-dialog__formats">
              {COOKBOOK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="cookbook-format-download"
                  onClick={() => onExportFormat(preset.id)}
                >
                  <span className="cookbook-format-download__text">
                    <span className="cookbook-format-download__name">{preset.productName}</span>
                    <span className="cookbook-format-download__trim">
                      {preset.trimLabel} · {preset.bestFor}
                    </span>
                  </span>
                  <span className="cookbook-format-download__cta">Save as PDF</span>
                </button>
              ))}
            </div>
            <p className="cookbook-print-dialog__hint">
              Saves using your browser&apos;s default print settings — choose &ldquo;Save as
              PDF&rdquo; as the destination.
            </p>
            <div className="cookbook-print-dialog__printers">
              <span className="cookbook-print-dialog__printers-label">
                Places you can print your cookbook
              </span>
              <ul className="cookbook-print-dialog__printer-list">
                {Object.values(PRINTERS).map((printer) => (
                  <li key={printer.id}>
                    <a
                      href={printer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cookbook-print-dialog__printer"
                      onClick={() => track("cookbook_printer_clicked", { printer: printer.id })}
                    >
                      <span className="cookbook-print-dialog__printer-name">{printer.name}</span>
                      <span className="cookbook-print-dialog__printer-note">{printer.note}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="cookbook-print-dialog__disclaimer">
                Popular printing services — not endorsed or certified partners, and each has its own
                file requirements. Hardcover print-on-demand usually needs a separate wraparound
                cover/spine file, which isn&apos;t part of this export yet.
              </p>
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
      {/* Leaving cookbook mode discards the whole book (cover, chapters, page
          layouts) — a confirm guards it the way recipe deletion does. The
          destructive button is intentionally NOT auto-focused, so Enter can't
          wipe the book. */}
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
              This clears your cookbook&apos;s cover, chapters, and page layouts. Your recipes stay
              in the queue, but you&apos;ll have to set the book up again to come back.
            </p>
            <div className="print-success-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={onCancelExitCookbook}>
                Keep my cookbook
              </button>
              <button type="button" className="btn btn-danger" onClick={onConfirmExitCookbook}>
                Switch to recipe cards
              </button>
            </div>
      </Dialog>
    </>
  );
}
