"use client";

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { ICON_SIZE, XIcon } from "@/components/icons";
import { PrintSetupControls } from "@/components/print/PrintSetupControls";
import { ThemePicker } from "@/components/print/ThemePicker";
import type { PhotoStyle } from "@/lib/project";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";

interface PrintConfigPanelProps {
  configPanelRef: RefObject<HTMLElement>;
  mobileDrawer: "template" | null;
  setMobileDrawer: Dispatch<SetStateAction<"template" | null>>;
  cookbookMode: boolean;
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
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  /** Whether there's a card-format setting to offer at all (cut lines, a
      back side to toggle) — see `hasPrintSettingsFields` in app/print/page.tsx.
      Gates the "Card settings" section below so an empty fieldset never
      shows for a cookbook or a recipe with no back side. */
  hasPrintSettingsFields: boolean;
  /** Cut lines / two-sided, pre-rendered by the page (`renderPrintSettingsFields`)
      so this panel doesn't need its own copy of which fields apply when. */
  cardSettingsFields: ReactNode;
}

/**
 * The right-hand Print-setup / Book-settings panel (a mobile drawer under
 * `is-mobile-open`). Header + the setup controls + the theme grid + the footer
 * actions (Print / Purchase & Print / Unlock & Print, Save project, Print
 * settings). Purely presentational — every value and callback is owned by the
 * print page.
 */
export function PrintConfigPanel({
  configPanelRef,
  mobileDrawer,
  setMobileDrawer,
  cookbookMode,
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
  setToastMessage,
  hasPrintSettingsFields,
  cardSettingsFields,
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
        {/* The persistent desktop sidebar needs no heading of its own — the
            panel's contents (theme grid, photo/link controls) already say
            what it is, and the document's name is in the top-left corner of
            the bar. Only the mobile Themes SHEET still needs one: it's a
            transient dialog with nothing else on screen to say what it's
            showing. */}
        {mobileDrawer === "template" && (
          <h2 className="text-cp-dialog-title font-extrabold tracking-[-0.02em] min-w-0 truncate">
            Themes
          </h2>
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
          customerInfo={customerInfo}
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
          hasPrintSettingsFields={hasPrintSettingsFields}
          cardSettingsFields={cardSettingsFields}
        />

        <ThemePicker
          cookbookMode={cookbookMode}
          template={template}
          setTemplate={setTemplate}
          customerInfo={customerInfo}
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
      </div>
    </aside>
  );
}
