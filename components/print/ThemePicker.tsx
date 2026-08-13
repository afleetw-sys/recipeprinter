"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { CrownIcon, XIcon, CheckIcon, ICON_SIZE } from "@/components/icons";
import { TemplateThumbnail } from "@/components/print/TemplateThumbnail";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
import { hasTemplateEntitlement } from "@/lib/recipePrinterPurchases";
import { track } from "@/lib/analytics";

interface ThemePickerProps {
  cookbookMode: boolean;
  template: RecipePrintTemplate;
  setTemplate: Dispatch<SetStateAction<RecipePrintTemplate>>;
  customerInfo: CustomerInfo | null;
  hasUnclaimedFreeTemplate: boolean;
  freeTemplateBannerDismissed: boolean;
  setFreeTemplateBannerDismissed: Dispatch<SetStateAction<boolean>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setMobileDrawer: Dispatch<SetStateAction<"template" | null>>;
}

/**
 * The theme grid in the Print-setup / Book-settings panel. Each option renders
 * the real card (via TemplateThumbnail) so previews can't drift from output.
 * Premium themes show a crown (or a check when owned) outside cookbook mode;
 * inside a cookbook every theme is included, so nothing reads as locked. The
 * price/paywall only ever appears at print time (the Print button), never here.
 */
export function ThemePicker({
  cookbookMode,
  template,
  setTemplate,
  customerInfo,
  hasUnclaimedFreeTemplate,
  freeTemplateBannerDismissed,
  setFreeTemplateBannerDismissed,
  setToastMessage,
  setMobileDrawer,
}: ThemePickerProps) {
  return (
    <div className="recipe-config-section recipe-config-section--template">
      {hasUnclaimedFreeTemplate && !freeTemplateBannerDismissed && !cookbookMode && (
        <div className="recipe-free-template-banner" role="status">
          <CrownIcon size={ICON_SIZE.md} />
          <div className="recipe-free-template-banner__copy">
            <strong>Thanks for being a CookPilot member!</strong>
            <span>Enjoy a free lifetime template, on us — pick any premium design below.</span>
          </div>
          <button
            type="button"
            className="recipe-free-template-banner__dismiss icon-close-btn"
            aria-label="Dismiss"
            onClick={() => setFreeTemplateBannerDismissed(true)}
          >
            <XIcon size={ICON_SIZE.xs} />
          </button>
        </div>
      )}
      <h3 className="recipe-config-label">Themes</h3>
      {!cookbookMode && (
        <p className="recipe-template-caption">
          Premium themes are $1.99 — yours for life.
        </p>
      )}
      <div className="recipe-template-list">
        {RECIPE_PRINT_TEMPLATE_OPTIONS.map((option) => {
          const premiumTemplate = isPremiumTemplate(option.id) ? option.id : null;
          // In cookbook mode every theme comes with the cookbook, so none
          // read as locked (no crown, no paywall).
          const locked =
            premiumTemplate !== null &&
            !hasTemplateEntitlement(customerInfo, premiumTemplate) &&
            !cookbookMode;
          const owned =
            premiumTemplate !== null &&
            hasTemplateEntitlement(customerInfo, premiumTemplate) &&
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

          return (
            <div
              key={option.id}
              role="button"
              tabIndex={0}
              className={`recipe-template-option recipe-template-option--${option.id} ${
                template === option.id ? "is-active" : ""
              }`}
              aria-pressed={template === option.id}
              aria-label={`${option.label}${locked ? " premium" : owned ? " owned" : ""}`}
              onClick={selectTemplate}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectTemplate();
                }
              }}
            >
              {/* Status only — no price here. The picker's job is "pick how it
                  looks"; cost only ever appears at the moment printing this
                  template is actually requested (see the Print button below). */}
              {locked && (
                <span className="recipe-template-option__premium" aria-label="Premium">
                  <CrownIcon size={ICON_SIZE.xs} />
                </span>
              )}
              {owned && (
                <span className="recipe-template-option__owned" aria-label="Owned">
                  <CheckIcon size={ICON_SIZE.xs} />
                </span>
              )}
              <TemplateThumbnail template={option.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
