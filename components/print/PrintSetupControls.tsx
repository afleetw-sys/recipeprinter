"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import { Checkbox, CheckboxGroup, SelectTile } from "@/components/Controls";
import { PrintFormatToggle } from "@/components/print/PrintFormatToggle";
import type { PrintCardSize } from "@/components/RecipeCardPrint";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import { hasMultiRecipeEntitlement } from "@/lib/recipePrinterPurchases";
import type { PhotoStyle } from "@/lib/project";

interface PrintSetupControlsProps {
  cookbookMode: boolean;
  cardSize: PrintCardSize;
  setCardSize: Dispatch<SetStateAction<PrintCardSize>>;
  /** The live entitlement state, purely to mark a Pro-only size with the
      shared badge (see `canUseCardSize` in lib/recipePrinterPurchases.ts) —
      a size stays fully selectable and previewable either way; only
      Print/Export enforces the gate. */
  customerInfo: CustomerInfo | null;
  anyRecipeHasImage: boolean;
  anyRecipeHasSourceUrl: boolean;
  /** How many recipes still carry the blurb their website came with. Zero
      hides the clear action: there is nothing left for it to take. */
  bookPhotoStyle: PhotoStyle | null;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  showPhoto: boolean;
  setShowPhoto: Dispatch<SetStateAction<boolean>>;
  showSourceUrl: boolean;
  showDescription: boolean;
  setShowDescription: (value: boolean) => void;
  anyRecipeHasDescription: boolean;
  setShowSourceUrl: Dispatch<SetStateAction<boolean>>;
  /** The cookbook book-design settings (table of contents, opening page, …),
      rendered between the photo control and the include toggles. Passed as a
      node because it's still owned by the print page. */
  bookDesignSettings: ReactNode;
  /** Whether there's a card-format setting to offer at all — see
      `hasPrintSettingsFields` in app/print/page.tsx. Gates the "Card
      settings" section so it never shows empty (a cookbook, or a recipe
      short enough to need neither cut lines nor a back side). */
  hasPrintSettingsFields: boolean;
  /** Cut lines / two-sided, pre-rendered by the page — see
      `renderPrintSettingsFields`. */
  cardSettingsFields: ReactNode;
}

/**
 * The top of the Print-setup / Book-settings panel: card Size (recipe-cards
 * only), the book-wide Photos style (cookbook), the page-owned book-design
 * settings slot, and the plain-cards Include toggles (photo / link). The theme
 * grid and the Print button live alongside this in the panel.
 */
export function PrintSetupControls({
  cookbookMode,
  cardSize,
  setCardSize,
  customerInfo,
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
  hasPrintSettingsFields,
  cardSettingsFields,
}: PrintSetupControlsProps) {
  /**
   * "Every recipe" is only an honest title where more than one recipe is
   * actually possible. Outside cookbook mode, a Free account can never hold
   * more than one at a time (`multiRecipeAddLocked` in
   * lib/recipePrinterPurchases.ts blocks adding a second) — so the section
   * below is skipped entirely for them; the page's own toolbar governs their
   * one recipe's photo and link instead. A cookbook is exempt: it is a bound
   * book of recipes independent of Pro, so it can hold many regardless of
   * this entitlement, and keeps the section unconditionally.
   */
  const multiRecipeCapable = cookbookMode || hasMultiRecipeEntitlement(customerInfo);
  return (
    <>
      {/* Print format is a recipe-card concept only. A cookbook is always
          bound letter pages, so this control is hidden in cookbook mode. */}
      {!cookbookMode && (
        <div className="recipe-config-section recipe-config-section--size">
          <span className="recipe-config-label">Size</span>
          <PrintFormatToggle
            cardSize={cardSize}
            setCardSize={setCardSize}
            customerInfo={customerInfo}
          />
          {/* The toggle's own preview is a small illustration, not a scale
              drawing — worth saying so once Card is actually picked, since
              "is this really 4x6 or just a thumbnail of one" is a fair thing
              to wonder before loading cardstock. Cut lines sit in their own
              section right below, not repeated here. */}
        </div>
      )}

      {/* Cut lines and the two-sided toggle, right under Size — this used to
          be a dialog behind a gear icon in the panel header, reachable but
          not really discoverable: nothing on screen said it existed until you
          went looking. Both fields are card-format concerns (cut lines only
          ever apply to the 4x6 card; two-sided only matters once a recipe is
          long enough to spill onto a second page), so they live right where
          that format gets chosen instead of in a separate dialog for a
          different kind of "settings". Gated on `hasPrintSettingsFields`
          rather than `cardSize === "card-6x4"`: a long recipe printed at
          Full Page can still need its back-side toggle, and hiding the
          section only because Card isn't selected would have taken that
          away. */}
      {!cookbookMode && hasPrintSettingsFields && (
        <CheckboxGroup
          label="Card settings"
          className="recipe-config-section recipe-config-section--card-settings"
        >
          {cardSettingsFields}
        </CheckboxGroup>
      )}

      {/* A cookbook's settings answer two different questions, and they used to
          be shuffled together: "Photos" sat above an "Include" list holding the
          table of contents, the opening page AND the recipe link. Two of those
          three add a PAGE to the book; the third changes every recipe, which is
          what the photo control above it was already doing. So they are grouped
          by what they do — pages the book gains, then what each recipe carries.
          `bookDesignSettings` (the pages half) comes first: it is about the
          book's shape, which you decide before its finish. */}
      {bookDesignSettings}

      {/* Shown whether or not anything has a photo yet. This is where the book
          says how photos are laid out, so gating it on `anyRecipeHasImage`
          meant the setting vanished from the panel for a new book and came
          back later on its own — which reads as a control that was removed,
          not one that is waiting. It also has to be settable BEFORE the photos
          arrive, since it is what every photo added afterwards inherits. */}
      {cookbookMode && (
        <div className="recipe-config-section recipe-config-section--photos">
          <span className="recipe-config-label">Every recipe</span>
          {/* The website's blurb, in or out.

              The old version of this switch hid the whole note — including the
              slot you write into — which is why it went. This one only takes
              the imported half out of the field and leaves anything the cook
              wrote where it is; ticking it again puts the blurb back above
              their words. Nothing is deleted either way, so it is safe to
              press twice (see lib/recipeNote.ts).

              Only offered when there is a blurb to include. On a book of
              hand-typed recipes the checkbox would govern nothing. */}
          {anyRecipeHasDescription && (
            <Checkbox
              label="Description"
              checked={showDescription}
              onChange={(event) => setShowDescription(event.target.checked)}
            />
          )}
          {/* Always offered in a cookbook, not only once a recipe has a link:
              a recipe can be given one by hand from its own toolbar, and this is
              the book-wide default that link is measured against. Toggling it
              resets every recipe's own choice, as the Photos tiles below do. */}
          <Checkbox
              label="Recipe link"
              checked={showSourceUrl}
              onChange={(event) => setShowSourceUrl(event.target.checked)}
          />
          {/* Plain text, not a second uppercase heading: the tiles belong to
              "Every recipe" like the checkboxes above them, and an eyebrow here
              made them a section of their own. */}
          <span className="recipe-config-sublabel" id="recipe-photos-label">
            Photos
          </span>
          {/* A subtitle under the label. These tiles change nothing on screen
              until a recipe has a photo, so a new book can look as though they
              are broken. Say why. */}
          {!anyRecipeHasImage && (
            <p className="-mt-1 text-cp-caption text-ink-soft">
              Add a photo to a recipe to see these layouts on its page.
            </p>
          )}
          <div
            className="recipe-photo-style"
            role="radiogroup"
            aria-labelledby="recipe-photos-label"
          >
            {PHOTO_STYLE_OPTIONS.map((option) => (
              <SelectTile
                key={option.id}
                selected={bookPhotoStyle === option.id}
                className="recipe-photo-style__tile"
              >
                <input
                  type="radio"
                  name="recipe-photo-style"
                  className="sr-only"
                  checked={bookPhotoStyle === option.id}
                  onChange={() => applyBookPhotoStyle(option.id)}
                />
                <PhotoStylePreview id={option.id} />
                <span className="recipe-photo-style__tile-label">{option.short}</span>
              </SelectTile>
            ))}
          </div>
        </div>
      )}

      {/* Recipe cards have no pages to add, so they get only the second group —
          and it is the same group, holding the same "Recipe link" checkbox a
          cookbook has. It said "Include" until the cookbook's copy stopped;
          now it says "Every recipe" only when there could BE more than one —
          see `multiRecipeCapable` above.

          With exactly one recipe possible, this section governed exactly one
          recipe's photo and link — the same thing the page's own toolbar now
          does directly (the photo picker's "None" tile, and the toolbar's
          link toggle). A second control for the same one recipe, sitting in a
          different panel, was redundant at best and disagreed with itself at
          worst; it's only offered once there's a real "every" for it to mean. */}
      {!cookbookMode && multiRecipeCapable && (anyRecipeHasImage || anyRecipeHasSourceUrl) && (
        <CheckboxGroup label="Every recipe" className="recipe-config-section recipe-config-section--settings">
          {anyRecipeHasImage && (
            <Checkbox
                label="Recipe photo"
                checked={showPhoto}
                onChange={(event) => setShowPhoto(event.target.checked)}
            />
          )}
          {anyRecipeHasSourceUrl && (
            <Checkbox
                label="Recipe link"
                checked={showSourceUrl}
                onChange={(event) => setShowSourceUrl(event.target.checked)}
            />
          )}
        </CheckboxGroup>
      )}
    </>
  );
}
