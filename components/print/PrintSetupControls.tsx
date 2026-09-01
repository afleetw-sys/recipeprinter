"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Checkbox, CheckboxGroup, SelectTile } from "@/components/Controls";
import { SelectMenu } from "@/components/Select";
import {
  PRINT_CARD_SIZE_OPTIONS,
  type PrintCardSize,
} from "@/components/RecipeCardPrint";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import type { PhotoStyle } from "@/lib/project";

interface PrintSetupControlsProps {
  cookbookMode: boolean;
  cardSize: PrintCardSize;
  setCardSize: Dispatch<SetStateAction<PrintCardSize>>;
  anyRecipeHasImage: boolean;
  anyRecipeHasSourceUrl: boolean;
  anyRecipeHasDescription: boolean;
  showDescription: boolean;
  setShowDescription: Dispatch<SetStateAction<boolean>>;
  bookPhotoStyle: PhotoStyle | null;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  showPhoto: boolean;
  setShowPhoto: Dispatch<SetStateAction<boolean>>;
  showSourceUrl: boolean;
  setShowSourceUrl: Dispatch<SetStateAction<boolean>>;
  /** The cookbook book-design settings (table of contents, opening page, …),
      rendered between the photo control and the include toggles. Passed as a
      node because it's still owned by the print page. */
  bookDesignSettings: ReactNode;
}

/**
 * The top of the Print-setup / Book-settings panel: card Size (recipe-cards
 * only), the book-wide Photos style (cookbook), the page-owned book-design
 * settings slot, and the plain-cards Include toggles (photo / link). The theme
 * grid and the Print button live alongside this in the panel.
 */
const PRINT_CARD_SIZE_LABELS = PRINT_CARD_SIZE_OPTIONS.map(({ id, label }) => ({ id, label }));

export function PrintSetupControls({
  cookbookMode,
  cardSize,
  setCardSize,
  anyRecipeHasImage,
  anyRecipeHasSourceUrl,
  anyRecipeHasDescription,
  showDescription,
  setShowDescription,
  bookPhotoStyle,
  applyBookPhotoStyle,
  showPhoto,
  setShowPhoto,
  showSourceUrl,
  setShowSourceUrl,
  bookDesignSettings,
}: PrintSetupControlsProps) {
  return (
    <>
      {/* Size is a recipe-card concept only. A cookbook is always bound
          letter pages, so the size control is hidden in cookbook mode. */}
      {!cookbookMode && (
        <div className="recipe-config-section recipe-config-section--size">
          <label className="recipe-config-label" htmlFor="recipe-print-size">
            Size
          </label>
          {/* Our own menu rather than the OS's, so the list matches every other
              menu in the workspace. Labels only — each size also carries a
              `detail`, but "Full page" and "6 x 4 card" already say it. */}
          <SelectMenu
            id="recipe-print-size"
            label="Card size"
            value={cardSize}
            options={PRINT_CARD_SIZE_LABELS}
            onChange={(next) => setCardSize(next as PrintCardSize)}
          />
        </div>
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
          {anyRecipeHasDescription && (
            <Checkbox
                label="Description"
                checked={showDescription}
                onChange={(event) => setShowDescription(event.target.checked)}
            />
          )}
          {anyRecipeHasSourceUrl && (
            <Checkbox
                label="Recipe link"
                checked={showSourceUrl}
                onChange={(event) => setShowSourceUrl(event.target.checked)}
            />
          )}
          {/* Plain text, not a second uppercase heading: the tiles belong to
              "Every recipe" like the checkboxes above them, and an eyebrow here
              made them a section of their own. */}
          <span className="recipe-config-sublabel" id="recipe-photos-label">
            Photos
          </span>
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
                title={option.hint}
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
          and it is the same group, under the same word, holding the same
          "Recipe link" checkbox a cookbook has. It said "Include" until the
          cookbook's copy stopped. */}
      {!cookbookMode && (anyRecipeHasImage || anyRecipeHasSourceUrl) && (
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
