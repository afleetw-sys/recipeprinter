"use client";

import { Checkbox, SelectTile } from "@/components/Controls";
import { Select } from "@/components/Select";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import type { PhotoStyle } from "@/lib/project";
import type { NavItem } from "@/lib/usePrintSheets";

/** What the selected recipe page can change about itself. */
export interface RecipePageSettings {
  photoMode: PhotoStyle;
  onPhotoModeChange: (mode: PhotoStyle) => void;
  hasPhoto: boolean;
  hasLink: boolean;
  linkShown: boolean;
  onLinkShownChange: (shown: boolean) => void;
  chapterId?: string;
  chapters: Array<{ id: string; title: string }>;
  onChapterChange: (sectionId: string) => void;
}

/**
 * The right panel's Page tab: the settings of the page the deck is on.
 *
 * Settings only. The quick actions (delete, move, the photo dialog's own
 * button) stay in the floating bar over the page, which a phone still needs
 * because it has no panel. Here they are laid out the way the Book tab lays
 * out the same choices for every recipe, so a recipe's photo tiles read as the
 * per-page version of the book's.
 */
export function PageSettings({
  page,
  recipe,
  onChoosePhoto,
}: {
  page: NavItem | null;
  recipe?: RecipePageSettings | null;
  /** Opens the page's photo dialog (the same one its toolbar opens). */
  onChoosePhoto?: () => void;
}) {
  if (!page) {
    return (
      <div className="recipe-config-section">
        <p className="recipe-page-settings__note">Select a page to see its settings.</p>
      </div>
    );
  }

  return (
    <div className="recipe-config-section recipe-page-settings">
      <span className="recipe-config-label">{pageKindName(page.kind)}</span>
      {page.label && <p className="recipe-page-settings__title">{page.label}</p>}

      {recipe && (
        <>
          <div className="recipe-photo-style-group">
            <span className="recipe-config-sublabel" id="recipe-page-photo-label">
              Photo
            </span>
            <div className="recipe-photo-style" role="radiogroup" aria-labelledby="recipe-page-photo-label">
              {PHOTO_STYLE_OPTIONS.map((option) => (
                <SelectTile
                  key={option.id}
                  selected={recipe.photoMode === option.id}
                  className="recipe-photo-style__tile"
                >
                  <input
                    type="radio"
                    name="recipe-page-photo-style"
                    className="sr-only"
                    checked={recipe.photoMode === option.id}
                    onChange={() => recipe.onPhotoModeChange(option.id)}
                  />
                  <PhotoStylePreview id={option.id} />
                  <span className="recipe-photo-style__tile-label">{option.short}</span>
                </SelectTile>
              ))}
            </div>
            {onChoosePhoto && (
              <button type="button" className="btn btn-secondary btn-compact" onClick={onChoosePhoto}>
                {recipe.hasPhoto ? "Change photo" : "Add photo"}
              </button>
            )}
          </div>

          <Checkbox
            label="Recipe link"
            hint={recipe.hasLink ? undefined : "This recipe has no link yet."}
            checked={recipe.hasLink && recipe.linkShown}
            disabled={!recipe.hasLink}
            onChange={(event) => recipe.onLinkShownChange(event.target.checked)}
          />

          {/* Only once there is somewhere else to put it. Making a chapter is
              Organize's and the page toolbar's job. */}
          {recipe.chapters.length > 1 && (
            <label className="recipe-page-settings__field">
              <span className="recipe-config-sublabel">Chapter</span>
              <Select
                variant="compact"
                value={recipe.chapterId ?? ""}
                onChange={(event) => recipe.onChapterChange(event.target.value)}
              >
                {recipe.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </>
      )}

      {!recipe && onChoosePhoto && page.kind !== "toc" && (
        <button type="button" className="btn btn-secondary btn-compact" onClick={onChoosePhoto}>
          Photo
        </button>
      )}

      {page.kind === "toc" && (
        <p className="recipe-page-settings__note">
          The contents is made from your chapters and recipes, so it updates as you change them.
        </p>
      )}
    </div>
  );
}

function pageKindName(kind: NavItem["kind"]): string {
  switch (kind) {
    case "recipe":
      return "Recipe page";
    case "divider":
      return "Chapter opener";
    case "cover":
      return "Cover";
    case "toc":
      return "Contents";
    case "image":
    case "section-photo":
      return "Photo page";
  }
}
