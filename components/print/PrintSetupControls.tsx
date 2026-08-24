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
export function PrintSetupControls({
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
          {/* Our own menu, not the OS's — and the reason is in the data: each
              size carries a `detail` ("Letter paper", "Landscape recipe card")
              that a native <option> has nowhere to show. */}
          <SelectMenu
            id="recipe-print-size"
            label="Card size"
            value={cardSize}
            options={PRINT_CARD_SIZE_OPTIONS}
            onChange={(next) => setCardSize(next as PrintCardSize)}
          />
        </div>
      )}

      {/* Cookbook photos are a book-wide choice (None / header / full page),
          overridable per page; plain cards keep the simple on/off checkbox. */}
      {anyRecipeHasImage && cookbookMode && (
        <div className="recipe-config-section recipe-config-section--photos">
          <span className="recipe-config-label" id="recipe-photos-label">
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

      {bookDesignSettings}

      {!cookbookMode && (anyRecipeHasImage || anyRecipeHasSourceUrl) && (
        <CheckboxGroup label="Include" className="recipe-config-section recipe-config-section--settings">
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
