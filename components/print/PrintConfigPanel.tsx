"use client";

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  CheckIcon,
  ICON_SIZE,
  XIcon,
  SlidersIcon,
} from "@/components/icons";
import { PrintSetupControls } from "@/components/print/PrintSetupControls";
import { ThemePicker } from "@/components/print/ThemePicker";
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
  /** Leaves the book and prints the same recipes as cards. The book is stashed
      with the project, so this is reversible and loses nothing. */
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
  showDescription: boolean;
  setShowDescription: (value: boolean) => void;
  anyRecipeHasDescription: boolean;
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
  cardSize,
  setCardSize,
  anyRecipeHasImage,
  anyRecipeHasSourceUrl,
  bookPhotoStyle,
  applyBookPhotoStyle,
  showPhoto,
  setShowPhoto,
  showSourceUrl,
  showDescription,
  setShowDescription,
  anyRecipeHasDescription,
  setShowSourceUrl,
  bookDesignSettings,
  template,
  setTemplate,
  customerInfo,
  hasUnclaimedFreeTemplate,
  freeTemplateBannerDismissed,
  setFreeTemplateBannerDismissed,
  setToastMessage,
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
          {/* Says what the panel IS, not what the document is called. The
              document's name is already in the top-left corner of the bar, so
              repeating it here spent the panel's only heading on a fact that
              was on screen twice — and left the panel itself unlabelled. */}
          {mobileDrawer === "template"
            ? "Themes"
            : cookbookMode
              ? "Cookbook settings"
              : "Print setup"}
        </h2>
        {cookbookMode && !cookbookLocked && mobileDrawer !== "template" && (
          <span className="recipe-purchased-chip" title="You own this cookbook. Export it as often as you like">
            <CheckIcon size={ICON_SIZE.xs} />
            Purchased
          </span>
        )}
        {/* The rest of the print settings — cut lines, double-sided, source URL
            — behind one icon, in line with the heading of the panel they belong
            to. They used to sit at the very bottom as a text link, below a
            scroll, which is the last place someone looks for a setting. */}
        {hasPrintSettingsFields && (
          <button
            type="button"
            className="recipe-config-panel__settings icon-button"
            aria-haspopup="dialog"
            aria-label="Print settings"
            title="Print settings"
            onClick={() => setPrintSettingsOpen(true)}
          >
            <SlidersIcon size={ICON_SIZE.md} />
          </button>
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
          showDescription={showDescription}
          setShowDescription={setShowDescription}
          anyRecipeHasDescription={anyRecipeHasDescription}
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
        {/* Print, Purchase and "switch to recipe cards" all left this panel.
            This is where you set up a print; they are things you DO to the
            document, and they now sit in the header with the document's own
            name — Print and Purchase as buttons, the card/cookbook switch under
            the title, which is the one place that already says which kind of
            document this is. "Save project" went earlier, and saving itself has
            since gone too: leaving the workspace files the project on the way
            out. What is left here is genuinely settings. */}
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
      </div>
    </aside>
  );
}
