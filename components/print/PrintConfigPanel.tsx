"use client";

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  BookIcon,
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
  projectSaveBusy: boolean;
  handleSaveProject: () => Promise<void> | void;
  savedProjectId: string | null;
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
  projectSaveBusy,
  handleSaveProject,
  savedProjectId,
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
        <h2 className="text-cp-dialog-title font-extrabold tracking-[-0.02em]">
          {mobileDrawer === "template"
            ? "Themes"
            : cookbookMode
              ? "Book Settings"
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
        {/* Hidden for this release alongside the rest of the account/cookbook
            surface — gated by COOKBOOK_ENABLED so it returns at launch. */}
        {COOKBOOK_ENABLED && !cookbookMode && (
          <button
            type="button"
            className="btn btn-secondary recipe-print-button"
            disabled={projectSaveBusy}
            onClick={() => void handleSaveProject()}
          >
            {projectSaveBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <BookIcon size={ICON_SIZE.md} />}
            {savedProjectId ? "Saved to account" : "Save project"}
          </button>
        )}
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
      </div>
    </aside>
  );
}
