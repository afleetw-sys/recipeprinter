"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { TemplateThumbnail } from "@/components/print/TemplateThumbnail";
import { ProBadge } from "@/components/ProBadge";
import { ChevronDownIcon, ChevronRightIcon, ICON_SIZE } from "@/components/icons";
import { arrangeThemes } from "@/lib/seasonalThemes";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
import { hasTemplateOrProEntitlement } from "@/lib/recipePrinterPurchases";
import { track } from "@/lib/analytics";

interface ThemePickerProps {
  cookbookMode: boolean;
  template: RecipePrintTemplate;
  setTemplate: Dispatch<SetStateAction<RecipePrintTemplate>>;
  customerInfo: CustomerInfo | null;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setMobileDrawer: Dispatch<SetStateAction<"template" | null>>;
  onCustomize: () => void;
}

/**
 * The theme grid in the Print-setup / Book-settings panel. Each option renders
 * the real card (via TemplateThumbnail) so previews can't drift from output.
 * Premium themes show a crown outside cookbook mode; inside a cookbook every
 * theme is included, so nothing reads as locked. There's no separate "owned"
 * mark for one you already have (a legacy single-theme purchase or Pro) — the
 * crown's absence already says that, and a check next to it on top said the
 * same thing twice while implying a distinction ("this one specifically is
 * yours") that a Pro subscriber, who owns all of them at once, doesn't have.
 * The price/paywall only ever appears at print time (the Print button), never
 * here.
 *
 * Seasonal themes (see lib/seasonalThemes) lead the Pro themes during their
 * featured dates, with no tag: being first is enough. The rest of the year they
 * sit in a collapsed "Seasonal themes" group at the end, still one tap away for
 * a year-round cookbook; it opens on its own when the chosen theme is one of
 * them, so the current theme never looks missing.
 */
export function ThemePicker({
  cookbookMode,
  template,
  setTemplate,
  customerInfo,
  setToastMessage,
  setMobileDrawer,
  onCustomize,
}: ThemePickerProps) {
  const today = new Date();
  const { main, seasonal } = arrangeThemes(
    RECIPE_PRINT_TEMPLATE_OPTIONS,
    (option) => isPremiumTemplate(option.id),
    today,
  );
  const currentIsSeasonal = seasonal.some((option) => option.id === template);
  const [seasonalOpen, setSeasonalOpen] = useState(currentIsSeasonal);
  const showSeasonal = seasonalOpen || currentIsSeasonal;

  // Opening the seasonal group adds themes below the fold of the settings
  // panel, so the click looked like it did nothing. Bring the toggle to the top
  // of whatever is scrolling (the panel, or the phone drawer) so the themes it
  // just revealed sit right under it. Only for a click, never on load.
  const seasonalToggleRef = useRef<HTMLButtonElement>(null);
  const revealSeasonalRef = useRef(false);
  useEffect(() => {
    if (!showSeasonal || !revealSeasonalRef.current) return;
    revealSeasonalRef.current = false;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    seasonalToggleRef.current?.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [showSeasonal]);

  function renderOption(option: (typeof RECIPE_PRINT_TEMPLATE_OPTIONS)[number]) {
    const premiumTemplate = isPremiumTemplate(option.id) ? option.id : null;
    // In cookbook mode every theme comes with the cookbook, so none
    // read as locked (no badge, no paywall).
    const locked =
      premiumTemplate !== null &&
      !hasTemplateOrProEntitlement(customerInfo, option.id) &&
      !cookbookMode;
    // A real card renders <div>s, which aren't valid inside a
    // <button> (its content model is phrasing only) — so the option
    // is a role="button" div with matching keyboard behavior.
    const selectTemplate = () => {
      setTemplate(option.id);
      track("template_selected", {
        template: option.id,
        premium: premiumTemplate !== null,
      });
      setToastMessage(null);
      setMobileDrawer(null);
    };

    const active = template === option.id;
    // The cell holds the tile and, on the chosen one, its Customize button:
    // a sibling laid over the tile rather than inside it, since the tile is a
    // button already and one can't hold another.
    return (
      <div key={option.id} className="recipe-template-cell">
      <div
        role="button"
        tabIndex={0}
        className={`recipe-template-option recipe-template-option--${option.id} ${
          template === option.id ? "is-active" : ""
        }`}
        aria-pressed={template === option.id}
        aria-label={`${option.label}${locked ? " Pro" : ""}`}
        onClick={selectTemplate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectTemplate();
          }
        }}
      >
        {/* Status only — no price here. The picker's job is "pick how it
            looks"; the Pro paywall only ever appears at the moment
            printing this template is actually requested (see the Print
            button below) — locked themes stay fully selectable and
            previewable here. */}
        {locked && <ProBadge tooltip="This theme is Pro" />}
        <TemplateThumbnail template={option.id} />
      </div>
      {/* On the theme it changes, so it can't read as making a theme of
          your own. */}
      {active && (
        <button type="button" className="recipe-template-customize" onClick={onCustomize}>
          Customize
          <ChevronRightIcon size={ICON_SIZE.sm} />
        </button>
      )}
      </div>
    );
  }

  return (
    <div className="recipe-config-section recipe-config-section--template">
      <h3 className="recipe-config-label">Themes</h3>
      <div className="recipe-template-list">{main.map(renderOption)}</div>
      {seasonal.length > 0 && (
        <>
          <button
            type="button"
            ref={seasonalToggleRef}
            className="recipe-template-seasonal-toggle"
            aria-expanded={showSeasonal}
            aria-controls="recipe-template-seasonal"
            onClick={() => {
              revealSeasonalRef.current = !showSeasonal;
              setSeasonalOpen(!showSeasonal);
            }}
          >
            Seasonal themes
            <ChevronDownIcon size={ICON_SIZE.sm} />
          </button>
          {showSeasonal && (
            <div id="recipe-template-seasonal" className="recipe-template-list">
              {seasonal.map(renderOption)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
