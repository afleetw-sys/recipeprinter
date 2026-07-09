"use client";

import { useEffect, useRef } from "react";
import { CrownIcon, ICON_SIZE, SpinnerIcon, TrashIcon, XIcon } from "@/components/icons";
import { useModalFocus } from "@/components/useModalFocus";
import type { PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const COFFEE_LOGO_SRC = "/images/buy-me-a-coffee-logo.png";

export function PrintDialogs({
  showDonateDialog,
  onCloseDonateDialog,
  onOpenFeedbackDialog,
  showUnlockDialog,
  onCloseUnlockDialog,
  selectedPremiumTemplate,
  selectedTemplateLabel,
  purchaseBusy,
  onUnlockTemplate,
  canClaimFree,
  claimBusy,
  onClaimTemplate,
  showDeleteRecipeDialog,
  deleteRecipeTitle,
  onCancelDeleteRecipe,
  onConfirmDeleteRecipe,
}: {
  showDonateDialog: boolean;
  onCloseDonateDialog: () => void;
  onOpenFeedbackDialog: () => void;
  showUnlockDialog: boolean;
  onCloseUnlockDialog: () => void;
  selectedPremiumTemplate: PremiumRecipePrintTemplate | null;
  selectedTemplateLabel: string;
  purchaseBusy: boolean;
  onUnlockTemplate: (template: PremiumRecipePrintTemplate) => void;
  canClaimFree: boolean;
  claimBusy: boolean;
  onClaimTemplate: (template: PremiumRecipePrintTemplate) => void;
  showDeleteRecipeDialog: boolean;
  deleteRecipeTitle: string;
  onCancelDeleteRecipe: () => void;
  onConfirmDeleteRecipe: () => void;
}) {
  const donateDialogRef = useRef<HTMLDivElement | null>(null);
  const unlockDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  useModalFocus(donateDialogRef, onCloseDonateDialog, { disabled: !showDonateDialog });
  useModalFocus(unlockDialogRef, onCloseUnlockDialog, {
    disabled: !showUnlockDialog,
    closeDisabled: purchaseBusy || claimBusy,
  });
  useModalFocus(deleteDialogRef, onCancelDeleteRecipe, { disabled: !showDeleteRecipeDialog });
  // Runs after useModalFocus's own mount-time focus (which grabs the first
  // focusable element — the X close button) so Enter defaults to actually
  // deleting rather than just closing, per the request that drove this dialog.
  useEffect(() => {
    if (showDeleteRecipeDialog) deleteButtonRef.current?.focus();
  }, [showDeleteRecipeDialog]);

  return (
    <>
      {showDonateDialog && (
        <div
          ref={donateDialogRef}
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-success-title"
          tabIndex={-1}
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
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
          </div>
        </div>
      )}
      {showUnlockDialog && selectedPremiumTemplate && (
        <div
          ref={unlockDialogRef}
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipeprinter-unlock-title"
          tabIndex={-1}
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseUnlockDialog}
              disabled={purchaseBusy}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="recipeprinter-unlock-title">Unlock {selectedTemplateLabel} theme?</h2>
            <p>
              RevenueCat checkout will ask for your email and save this theme for this browser.
            </p>
            <div className="print-success-dialog__actions">
              {canClaimFree && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={purchaseBusy || claimBusy}
                  onClick={() => onClaimTemplate(selectedPremiumTemplate)}
                >
                  {claimBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <CrownIcon size={ICON_SIZE.md} />}
                  Claim it — included with your CookPilot subscription
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={purchaseBusy || claimBusy}
                onClick={() => onUnlockTemplate(selectedPremiumTemplate)}
              >
                {purchaseBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <CrownIcon size={ICON_SIZE.md} />}
                Unlock & Print
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onCloseUnlockDialog}
                disabled={purchaseBusy || claimBusy}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteRecipeDialog && (
        <div
          ref={deleteDialogRef}
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-delete-title"
          tabIndex={-1}
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCancelDeleteRecipe}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="recipe-delete-title">Delete {deleteRecipeTitle}?</h2>
            <p>It&apos;ll be removed from your print list. This can&apos;t be undone.</p>
            <div className="print-success-dialog__actions">
              <button
                ref={deleteButtonRef}
                type="button"
                className="btn btn-primary"
                onClick={onConfirmDeleteRecipe}
              >
                <TrashIcon size={ICON_SIZE.md} />
                Delete
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancelDeleteRecipe}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
