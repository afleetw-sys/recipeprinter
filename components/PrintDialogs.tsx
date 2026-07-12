"use client";

import { useEffect, useRef, useState } from "react";
import { BookIcon, CheckIcon, CrownIcon, ICON_SIZE, SpinnerIcon, TrashIcon, XIcon } from "@/components/icons";
import { useModalFocus } from "@/components/useModalFocus";
import { COOKBOOK_BENEFITS } from "@/lib/cookbookProduct";
import type { PremiumRecipePrintTemplate } from "@/lib/premiumTemplates";

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
  showUnlockDialog,
  onCloseUnlockDialog,
  selectedPremiumTemplate,
  selectedTemplateLabel,
  selectedTemplatePrice,
  purchaseBusy,
  onUnlockTemplate,
  canClaimFree,
  claimBusy,
  onClaimTemplate,
  showCookbookOfferDialog,
  onCloseCookbookOfferDialog,
  onConfirmMakeCookbook,
  showCookbookUnlockDialog,
  onCloseCookbookUnlockDialog,
  cookbookPrice,
  cookbookPurchaseBusy,
  onUnlockCookbook,
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
  showUnlockDialog: boolean;
  onCloseUnlockDialog: () => void;
  selectedPremiumTemplate: PremiumRecipePrintTemplate | null;
  selectedTemplateLabel: string;
  selectedTemplatePrice?: string;
  purchaseBusy: boolean;
  onUnlockTemplate: (template: PremiumRecipePrintTemplate) => void;
  canClaimFree: boolean;
  claimBusy: boolean;
  onClaimTemplate: (template: PremiumRecipePrintTemplate) => void;
  showCookbookOfferDialog: boolean;
  onCloseCookbookOfferDialog: () => void;
  onConfirmMakeCookbook: () => void;
  showCookbookUnlockDialog: boolean;
  onCloseCookbookUnlockDialog: () => void;
  cookbookPrice: string;
  cookbookPurchaseBusy: boolean;
  onUnlockCookbook: () => void;
  showDeleteRecipeDialog: boolean;
  deleteItemTitle: string;
  deleteItemDescription: string;
  deletePrimaryLabel?: string;
  sectionRecipeCount?: number;
  onCancelDeleteRecipe: () => void;
  onConfirmDeleteRecipe: () => void;
  onConfirmDeleteSectionRecipes?: () => void;
}) {
  const donateDialogRef = useRef<HTMLDivElement | null>(null);
  const unlockDialogRef = useRef<HTMLDivElement | null>(null);
  const cookbookOfferDialogRef = useRef<HTMLDivElement | null>(null);
  const cookbookUnlockDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [alsoDeleteSectionRecipes, setAlsoDeleteSectionRecipes] = useState(false);
  const showSectionRecipeCheckbox =
    sectionRecipeCount !== undefined && sectionRecipeCount > 0 && Boolean(onConfirmDeleteSectionRecipes);
  useModalFocus(donateDialogRef, onCloseDonateDialog, { disabled: !showDonateDialog });
  useModalFocus(unlockDialogRef, onCloseUnlockDialog, {
    disabled: !showUnlockDialog,
    closeDisabled: purchaseBusy || claimBusy,
  });
  useModalFocus(cookbookOfferDialogRef, onCloseCookbookOfferDialog, {
    disabled: !showCookbookOfferDialog,
  });
  useModalFocus(cookbookUnlockDialogRef, onCloseCookbookUnlockDialog, {
    disabled: !showCookbookUnlockDialog,
    closeDisabled: cookbookPurchaseBusy,
  });
  useModalFocus(deleteDialogRef, onCancelDeleteRecipe, { disabled: !showDeleteRecipeDialog });
  // Runs after useModalFocus's own mount-time focus (which grabs the first
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
            <h2 id="recipeprinter-unlock-title">
              Unlock {selectedTemplateLabel} theme{selectedTemplatePrice ? ` — ${selectedTemplatePrice}` : ""}?
            </h2>
            <p>
              A one-time purchase — {selectedTemplateLabel} is yours to print with on every future
              recipe, no separate charge later. RevenueCat checkout will ask for your email and save
              this theme for this browser.
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
      {showCookbookOfferDialog && (
        <div
          ref={cookbookOfferDialogRef}
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookbook-offer-title"
          tabIndex={-1}
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseCookbookOfferDialog}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <div className="print-success-dialog__icon" aria-hidden>
              <BookIcon size={30} />
            </div>
            <h2 id="cookbook-offer-title">Create a beautiful cookbook</h2>
            <p>
              Your recipes are automatically transformed into a professionally designed cookbook
              with:
            </p>
            <CookbookBenefitsList />
            <p className="cookbook-offer-dialog__price">{cookbookPrice}</p>
            <p className="cookbook-offer-dialog__price-note">Only charged when you export.</p>
            <div className="print-success-dialog__actions">
              <button type="button" className="btn btn-primary" onClick={onConfirmMakeCookbook}>
                <BookIcon size={ICON_SIZE.md} />
                Make it a cookbook
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCloseCookbookOfferDialog}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {showCookbookUnlockDialog && (
        <div
          ref={cookbookUnlockDialogRef}
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookbook-unlock-title"
          tabIndex={-1}
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close icon-close-btn"
              aria-label="Close"
              onClick={onCloseCookbookUnlockDialog}
              disabled={cookbookPurchaseBusy}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
            <h2 id="cookbook-unlock-title">Unlock your cookbook — {cookbookPrice}</h2>
            <p>
              A one-time purchase — this cookbook is yours to re-export forever, no separate
              charge later. RevenueCat checkout will ask for your email.
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
                Unlock & Export
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
              <button
                ref={deleteButtonRef}
                type="button"
                className="btn btn-primary"
                onClick={confirmDelete}
              >
                <TrashIcon size={ICON_SIZE.md} />
                {deletePrimaryLabel ?? "Delete"}
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
