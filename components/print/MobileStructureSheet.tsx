"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { SelectTile } from "@/components/Controls";
import { MobileSheet } from "@/components/print/MobileSheet";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import { PhotoStyleTip, type PhotoStyleTipState } from "@/components/print/PhotoStyleTip";
import { useProjectMeta, type PhotoStyle } from "@/lib/project";
import type { Section } from "@/types/recipe";

interface MobileStructureSheetProps {
  projectMeta: ReturnType<typeof useProjectMeta>;
  sections: Section[];
  bookPhotoStyle: PhotoStyle | null;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  /** Set when the cook has been choosing the same photo layout recipe by
      recipe; see components/print/PhotoStyleTip.tsx. */
  photoStyleTip?: PhotoStyleTipState | null;
  onDismissPhotoStyleTip?: () => void;
  /** See `PrintSetupControls.websitePhotosField`. */
  websitePhotosField?: ReactNode;
  showSourceUrl: boolean;
  setShowSourceUrl: (next: boolean) => void;
  bookSheet: MobileBookSheet;
  setBookSheet: Dispatch<SetStateAction<MobileBookSheet>>;
}

/** Which of the book-wide sheets is open, from the bottom bar's tiles. */
/** "page": the selected page's settings, the desktop panel's Page tab. */
/** Under a phone's Photos sheet title, cookbook or cards: the sheet sets every
    recipe's photo, and one recipe's own is changed on its page's toolbar. */
export const PHOTOS_SHEET_NOTE = "This applies to every recipe. Change just one from its toolbar.";

export type MobileBookSheet = "recipes" | "page" | null;

/**
 * The mobile cookbook sheets. Desktop uses the page rail and the Book
 * Settings panel instead; these are the touch-native equivalents, since the
 * mobile config drawer only ever opens the Themes section.
 *
 * - "Photos" (its own tile in the bottom bar): every recipe's photo layout,
 *   as the desktop panel's "Every recipe" group holds it.
 *   The phone's old "Pages" sheet of cover/dedication/contents checkboxes is
 *   gone, as it went from desktop: a page is deleted with its own Delete and
 *   comes back from the page overview (MobilePagesPanel).
 *
 * Organize used to be a sheet here too. It now happens inside the Pages view
 * (MobilePagesPanel), the way Pinterest organizes a board.
 */
export function MobileStructureSheet({
  projectMeta,
  sections,
  bookPhotoStyle,
  applyBookPhotoStyle,
  photoStyleTip,
  onDismissPhotoStyleTip,
  websitePhotosField,
  showSourceUrl,
  setShowSourceUrl,
  bookSheet,
  setBookSheet,
}: MobileStructureSheetProps) {
    if (!projectMeta.meta.cookbookMode) return null;
    return (
      <>
        <MobileSheet
          open={bookSheet === "recipes"}
          onClose={() => setBookSheet(null)}
          title="Photos"
          subtitle={PHOTOS_SHEET_NOTE}
          className="recipe-structure-sheet"
        >
            {/* The desktop panel's "Every recipe" group: the link, then the
                photo layout. Always offered in a cookbook, as on desktop: a
                recipe can be given a link by hand, and this is the book-wide
                default it is measured against. */}
            <div className="recipe-structure-sheet__settings">
              <div
                data-photo-style-section
                className={`recipe-photo-style-group ${photoStyleTip ? "is-highlighted" : ""}`}
              >
                {/* The sheet is titled Photos; this names the tiles for a
                    screen reader without saying it twice on screen. */}
                <span className="sr-only" id="sheet-photos-label">
                  Photos
                </span>
                <div
                  className="recipe-photo-style"
                  role="radiogroup"
                  aria-labelledby="sheet-photos-label"
                >
                  {PHOTO_STYLE_OPTIONS.map((option) => (
                    <SelectTile
                      key={option.id}
                      selected={bookPhotoStyle === option.id}
                      className="recipe-photo-style__tile"
                    >
                      <input
                        type="radio"
                        name="recipe-sheet-photo-style"
                        className="sr-only"
                        checked={bookPhotoStyle === option.id}
                        onChange={() => applyBookPhotoStyle(option.id)}
                      />
                      <PhotoStylePreview id={option.id} />
                      <span className="recipe-photo-style__tile-label">{option.short}</span>
                    </SelectTile>
                  ))}
                </div>
                {photoStyleTip && onDismissPhotoStyleTip && (
                  <PhotoStyleTip onDismiss={onDismissPhotoStyleTip} />
                )}
              </div>
              {websitePhotosField}
            </div>
        </MobileSheet>
      </>
    );
}
