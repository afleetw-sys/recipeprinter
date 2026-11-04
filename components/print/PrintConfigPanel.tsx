"use client";

import { useEffect, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { ICON_SIZE, XIcon } from "@/components/icons";
import { SegmentedControl } from "@/components/Controls";
import { PrintSetupControls } from "@/components/print/PrintSetupControls";
import type { PhotoStyleTipState } from "@/components/print/PhotoStyleTip";
import { ThemePicker } from "@/components/print/ThemePicker";
import { ThemeCustomizePanel } from "@/components/print/ThemeCustomizePanel";
import type { PhotoStyle } from "@/lib/project";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { FontScale } from "@/lib/fontScale";
import type { PhotoScale } from "@/lib/photoScale";
import type { AccentColor, SupperUtensil } from "@/lib/themeAccent";

interface PrintConfigPanelProps {
  configPanelRef: RefObject<HTMLElement>;
  mobileDrawer: "template" | null;
  setMobileDrawer: Dispatch<SetStateAction<"template" | null>>;
  cookbookMode: boolean;
  /** Turns this print job into a cookbook. A create action, not a view change —
      see `renderModeSwitch`'s removal in app/print/page.tsx. */
  /** The cover title — this panel's heading in cookbook mode. */
  // There is deliberately no "back to cards" prop. The cards switch was
  // removed on 2026-09-18, and imports into a book don't use the free card
  // import allowance, so a control that moved a book's recipes into card mode
  // would have to charge them as card imports (docs/import-meter-plan.md, 1.3).
  // Setup controls (Size / Photos / Include)
  cardSize: PrintCardSize;
  setCardSize: Dispatch<SetStateAction<PrintCardSize>>;
  // The current theme's own look (lib/themeLooks.ts), under Customize.
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  photoScale: PhotoScale;
  setPhotoScale: (value: PhotoScale) => void;
  accent: AccentColor | null;
  setAccent: (value: AccentColor | null) => void;
  posterColor: number | null;
  setPosterColor: (value: number | null) => void;
  utensil: SupperUtensil | null;
  setUtensil: (value: SupperUtensil | null) => void;
  themeCustomized: boolean;
  resetThemeLook: () => void;
  /** Customize theme's Each part: the size every recipe's part has, and its
      setter (`undefined` = follow Text size). See lib/pageLooks.tsx. */
  recipePartSizes?: Record<string, { textSize?: number }>;
  setRecipePartSize?: (part: string, size: number | undefined) => void;
  /** A free account on recipe cards, where customizing is Pro. */
  customizeProMarked: boolean;
  /** Whether any recipe page draws a photo for a photo size to change. */
  photosShown: boolean;
  anyRecipeHasImage: boolean;
  anyRecipeHasSourceUrl: boolean;
  bookPhotoStyle: PhotoStyle | null;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  /** Set when the cook has been choosing the same photo layout recipe by
      recipe; see components/print/PhotoStyleTip.tsx. */
  photoStyleTip?: PhotoStyleTipState | null;
  onDismissPhotoStyleTip?: () => void;
  showPhoto: boolean;
  setShowPhoto: Dispatch<SetStateAction<boolean>>;
  showSourceUrl: boolean;
  setShowSourceUrl: Dispatch<SetStateAction<boolean>>;
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
  /** See `PrintSetupControls.websitePhotosField`. */
  websitePhotosField?: ReactNode;
  /** A cookbook's Page tab: the selected page's own settings (PageSettings).
      Present only in a cookbook, where the panel splits into Book and Page. */
  pageSettings?: ReactNode;
}

type PanelTab = "book" | "page";

/**
 * The right-hand Print-setup / Book-settings panel (a mobile drawer under
 * `is-mobile-open`). Header + the setup controls + the theme grid + the footer
 * actions (Print / Buy & Print / Unlock & Print, Save project, Print
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
  fontScale,
  setFontScale,
  photoScale,
  setPhotoScale,
  accent,
  setAccent,
  posterColor,
  setPosterColor,
  utensil,
  setUtensil,
  themeCustomized,
  resetThemeLook,
  recipePartSizes,
  setRecipePartSize,
  customizeProMarked,
  photosShown,
  anyRecipeHasImage,
  anyRecipeHasSourceUrl,
  bookPhotoStyle,
  applyBookPhotoStyle,
  photoStyleTip,
  onDismissPhotoStyleTip,
  showPhoto,
  setShowPhoto,
  showSourceUrl,
  setShowSourceUrl,
  template,
  setTemplate,
  customerInfo,
  setToastMessage,
  hasPrintSettingsFields,
  cardSettingsFields,
  websitePhotosField,
  pageSettings,
}: PrintConfigPanelProps) {
  // Which tab a cookbook's panel shows. Kept as the cook left it while they
  // work, not moved by selecting pages, so browsing themes isn't interrupted
  // by every click on the deck. Opening a book always starts on Book: the
  // first thing a new book asks for is how the whole thing should look.
  const [tab, setTab] = useState<PanelTab>("book");
  // The photo-style tip points at the Book tab's Photos tiles, so it brings
  // that tab forward rather than pointing at something hidden.
  useEffect(() => {
    if (photoStyleTip) setTab("book");
  }, [photoStyleTip]);
  const chooseTab = (next: PanelTab) => setTab(next);
  // The Customize view stands in for the whole main view, with its own way
  // back, rather than opening under the theme grid where it would be one
  // more section to scroll past.
  const [customizing, setCustomizing] = useState(false);
  // The phone's Themes sheet opens on its themes each time, not wherever it
  // was left.
  useEffect(() => {
    setCustomizing(false);
  }, [mobileDrawer]);
  // The phone's Themes sheet is the book's theme grid alone; tabs are the
  // desktop panel's.
  const tabbed = cookbookMode && Boolean(pageSettings) && !mobileDrawer;
  const showBook = !tabbed || tab === "book";

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
        {/* A cookbook's desktop panel is titled, so its Book / Page tabs sit
            on the row below, clear of the collapse button in this corner. */}
        {/* Named for what it changes. Someone sized the text here expecting
            the dedication page to grow, so a book's panel says it is the
            book's: the whole cookbook, or this page under the Page tab. */}
        {cookbookMode && !mobileDrawer && (
          <h2 className="recipe-config-panel__title">{tabbed ? "Settings" : "Cookbook settings"}</h2>
        )}
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

      {tabbed && (
        <div className="recipe-config-panel__tabs">
          <SegmentedControl<PanelTab>
            label="Settings for"
            value={tab}
            onChange={chooseTab}
            options={[
              { id: "book", label: "Book" },
              { id: "page", label: "Page" },
            ]}
          />
        </div>
      )}

      {/* Only the Page tab says where its changes go: the panel is the
          book's unless it says otherwise. */}
      {cookbookMode && !mobileDrawer && !customizing && tabbed && tab === "page" && (
        <p className="recipe-config-panel__note">Changes here apply to this page only.</p>
      )}

      <div className="recipe-config-panel__scroll">
        {tabbed && tab === "page" && pageSettings}
        {showBook && customizing && (
          <ThemeCustomizePanel
            cookbook={cookbookMode}
            proMarked={customizeProMarked}
            photosShown={photosShown}
            fontScale={fontScale}
            setFontScale={setFontScale}
            photoScale={photoScale}
            setPhotoScale={setPhotoScale}
            accent={accent}
            setAccent={setAccent}
            posterColor={posterColor}
            setPosterColor={setPosterColor}
            utensil={utensil}
            setUtensil={setUtensil}
            template={template}
            customized={themeCustomized}
            onReset={resetThemeLook}
            recipePartSizes={recipePartSizes}
            setRecipePartSize={setRecipePartSize}
            onBack={() => setCustomizing(false)}
          />
        )}
        {showBook && !customizing && (
        <>
        <PrintSetupControls
          cookbookMode={cookbookMode}
          cardSize={cardSize}
          setCardSize={setCardSize}
          customerInfo={customerInfo}
          anyRecipeHasImage={anyRecipeHasImage}
          anyRecipeHasSourceUrl={anyRecipeHasSourceUrl}
          bookPhotoStyle={bookPhotoStyle}
          applyBookPhotoStyle={applyBookPhotoStyle}
          photoStyleTip={photoStyleTip}
          onDismissPhotoStyleTip={onDismissPhotoStyleTip}
          showPhoto={showPhoto}
          setShowPhoto={setShowPhoto}
          showSourceUrl={showSourceUrl}
          setShowSourceUrl={setShowSourceUrl}
          hasPrintSettingsFields={hasPrintSettingsFields}
          cardSettingsFields={cardSettingsFields}
          websitePhotosField={websitePhotosField}
        />

        <ThemePicker
          cookbookMode={cookbookMode}
          template={template}
          setTemplate={setTemplate}
          customerInfo={customerInfo}
          setToastMessage={setToastMessage}
          setMobileDrawer={setMobileDrawer}
          onCustomize={() => setCustomizing(true)}
        />
        </>
        )}
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
