"use client";

import Link from "next/link";

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  CheckIcon,
  ICON_SIZE,
  PrintIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/icons";
import { PrintSetupControls } from "@/components/print/PrintSetupControls";
import { ThemePicker } from "@/components/print/ThemePicker";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import type { PhotoStyle } from "@/lib/project";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";

interface PrintConfigPanelProps {
  configPanelRef: RefObject<HTMLElement>;
  mobileDrawer: "template" | null;
  setMobileDrawer: Dispatch<SetStateAction<"template" | null>>;
  cookbookMode: boolean;
  cookbookLocked: boolean;
  /** Turns this print job into a cookbook. A create action, not a view change —
      see `renderModeSwitch`'s removal in app/print/page.tsx. */
  /** The cover title — this panel's heading in cookbook mode. */
  bookTitle: string | undefined;
  /** Leaves the book and prints the same recipes as cards. The book is stashed
      with the project, so this is reversible and loses nothing. */
  onSwitchToCards: () => void;
  // Setup controls (Size / Photos / Include)
  cardSize: PrintCardSize;
  setCardSize: Dispatch<SetStateAction<PrintCardSize>>;
  anyRecipeHasImage: boolean;
  anyRecipeHasSourceUrl: boolean;
  bookPhotoStyle: PhotoStyle | null;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  showPhoto: boolean;
  setShowPhoto: Dispatch<SetStateAction<boolean>>;
  showSourceUrl: boolean;
  setShowSourceUrl: Dispatch<SetStateAction<boolean>>;
  bookDesignSettings: ReactNode;
  // Theme picker
  template: RecipePrintTemplate;
  setTemplate: Dispatch<SetStateAction<RecipePrintTemplate>>;
  customerInfo: CustomerInfo | null;
  hasUnclaimedFreeTemplate: boolean;
  freeTemplateBannerDismissed: boolean;
  setFreeTemplateBannerDismissed: Dispatch<SetStateAction<boolean>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  // Footer actions
  handlePrint: () => Promise<void> | void;
  printBlocked: boolean;
  printSpinner: boolean;
  templateLocked: boolean;
  isRecipePrinterAdmin: boolean;
  canShareActiveRecipe: boolean;
  setShowShareDialog: Dispatch<SetStateAction<boolean>>;
  hasPrintSettingsFields: boolean;
  setPrintSettingsOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * The right-hand Print-setup / Book-settings panel (a mobile drawer under
 * `is-mobile-open`). Header + the setup controls + the theme grid + the footer
 * actions (Print / Purchase & Print / Unlock & Print, Save project, share link,
 * Print settings). Purely presentational — every value and callback is owned by
 * the print page.
 */
export function PrintConfigPanel({
  configPanelRef,
  mobileDrawer,
  setMobileDrawer,
  cookbookMode,
  cookbookLocked,
  bookTitle,
  onSwitchToCards,
  cardSize,
  setCardSize,
  anyRecipeHasImage,
  anyRecipeHasSourceUrl,
  bookPhotoStyle,
  applyBookPhotoStyle,
  showPhoto,
  setShowPhoto,
  showSourceUrl,
  setShowSourceUrl,
  bookDesignSettings,
  template,
  setTemplate,
  customerInfo,
  hasUnclaimedFreeTemplate,
  freeTemplateBannerDismissed,
  setFreeTemplateBannerDismissed,
  setToastMessage,
  handlePrint,
  printBlocked,
  printSpinner,
  templateLocked,
  isRecipePrinterAdmin,
  canShareActiveRecipe,
  setShowShareDialog,
  hasPrintSettingsFields,
  setPrintSettingsOpen,
}: PrintConfigPanelProps) {
  return (
    <aside
      ref={configPanelRef}
      className={`recipe-config-panel no-print ${mobileDrawer ? "is-mobile-open" : ""}`}
      aria-label="Recipe print settings"
      role={mobileDrawer ? "dialog" : undefined}
      aria-modal={mobileDrawer ? "true" : undefined}
      tabIndex={mobileDrawer ? -1 : undefined}
      data-mobile-drawer={mobileDrawer ?? undefined}
    >
      <div className="recipe-config-panel__header">
        {/* In a book this heading is the book's NAME, not "Book Settings" —
            the workspace has to say which document you're editing somewhere,
            and a generic label was spending the most prominent line in the
            panel to state something the surrounding UI already makes obvious.
            One line, truncated: a long title should never push the Purchased
            chip or the close button around. */}
        <h2 className="text-cp-dialog-title font-extrabold tracking-[-0.02em] min-w-0 truncate">
          {mobileDrawer === "template"
            ? "Themes"
            : cookbookMode
              ? bookTitle?.trim() || "Untitled cookbook"
              : "Print setup"}
        </h2>
        {cookbookMode && !cookbookLocked && mobileDrawer !== "template" && (
          <span className="recipe-purchased-chip" title="You own this cookbook — export it as often as you like">
            <CheckIcon size={ICON_SIZE.xs} />
            Purchased
          </span>
        )}
        <button
          type="button"
          className="recipe-config-panel__close icon-close-btn"
          aria-label="Close print settings"
          onClick={() => setMobileDrawer(null)}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>

      <div className="recipe-config-panel__scroll">
        <PrintSetupControls
          cookbookMode={cookbookMode}
          cardSize={cardSize}
          setCardSize={setCardSize}
          anyRecipeHasImage={anyRecipeHasImage}
          anyRecipeHasSourceUrl={anyRecipeHasSourceUrl}
          bookPhotoStyle={bookPhotoStyle}
          applyBookPhotoStyle={applyBookPhotoStyle}
          showPhoto={showPhoto}
          setShowPhoto={setShowPhoto}
          showSourceUrl={showSourceUrl}
          setShowSourceUrl={setShowSourceUrl}
          bookDesignSettings={bookDesignSettings}
        />

        <ThemePicker
          cookbookMode={cookbookMode}
          template={template}
          setTemplate={setTemplate}
          customerInfo={customerInfo}
          hasUnclaimedFreeTemplate={hasUnclaimedFreeTemplate}
          freeTemplateBannerDismissed={freeTemplateBannerDismissed}
          setFreeTemplateBannerDismissed={setFreeTemplateBannerDismissed}
          setToastMessage={setToastMessage}
          setMobileDrawer={setMobileDrawer}
        />
      </div>

      <div className="recipe-config-panel__footer">
        {/* Print (or Unlock/Purchase & Print) is the primary action, so it
            always sits above the secondary "Save project". */}
        <button
          onClick={() => void handlePrint()}
          className="btn btn-primary recipe-print-button"
          disabled={printBlocked}
        >
          {printSpinner ? (
            <SpinnerIcon size={ICON_SIZE.md} />
          ) : (
            <PrintIcon size={ICON_SIZE.md} />
          )}
          {cookbookLocked
            ? "Purchase & Print"
            : templateLocked
              ? "Unlock & Print"
              : "Print"}
        </button>
        {/* Making a cookbook is a CREATE action, so it reads as one and sits with
            the other actions. It used to be half of a segmented control in the
            header, which implied two views of one thing — but a cookbook is a
            paid document with a cover and chapters and a card job is a free
            print, and the header now says which document you're in, so a toggle
            there was answering the same question differently. */}
        {COOKBOOK_ENABLED && cookbookMode && (
          <button type="button" className="recipe-print-settings-link" onClick={onSwitchToCards}>
            Print as recipe cards instead
          </button>
        )}
        {/* "Save project" lived here as a third full-width button and is gone.
            It was the largest control in the panel for an action taken once,
            it sat among PRINT settings which is not what it did, and it
            duplicated a "Saved" indicator already sitting beside the account
            avatar — two places claiming to own the same fact. Saving now
            happens where that word already is: see `onSave` on SiteHeader. */
        }
        {/* Share links are a single-recipe-card feature; a cookbook is a
            whole bound book, so this is hidden in cookbook mode even for the
            admin user. */}
        {isRecipePrinterAdmin && canShareActiveRecipe && !cookbookMode && (
          <button
            type="button"
            className="recipe-print-settings-link"
            aria-haspopup="dialog"
            onClick={() => setShowShareDialog(true)}
          >
            Save as share link
          </button>
        )}
        {hasPrintSettingsFields && (
          <button
            type="button"
            className="recipe-print-settings-link"
            aria-haspopup="dialog"
            onClick={() => setPrintSettingsOpen(true)}
          >
            Print settings
          </button>
        )}
        {/* Reopening something is a thing you do AROUND the document you have
            open, which is what this row already collects. It also gets the
            library out from behind the account avatar, where it had been
            filed under identity. */}
        <Link href="/projects" className="recipe-print-settings-link">
          Saved projects
        </Link>
      </div>
    </aside>
  );
}
