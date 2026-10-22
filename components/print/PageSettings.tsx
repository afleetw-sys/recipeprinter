"use client";

import type { ReactNode } from "react";
import { Checkbox, SelectTile } from "@/components/Controls";
import { Select } from "@/components/Select";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import type { PhotoStyle } from "@/lib/project";
import type { NavItem } from "@/lib/usePrintSheets";

/**
 * What a page IS. "design": the theme lays it out, with its words and any
 * photo. "image": the cook's own image, edge to edge, nothing else (a cover
 * they designed themselves). "blank": nothing at all. Changing it changes the
 * page, not a detail on it; the words stay stored, so going back to the
 * design hands them back.
 */
export type PageType = "design" | "image" | "blank";

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  design: "Theme design",
  image: "Full image",
  blank: "Blank",
};

/** A theme-designed cover's or opening page's photo. */
export type CoverPhoto = "typographic" | "photo" | "collage";

const COVER_PHOTO_OPTIONS: Array<{ id: CoverPhoto; label: string }> = [
  { id: "typographic", label: "None" },
  { id: "photo", label: "Photo" },
  { id: "collage", label: "Collage" },
];

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

/** A chapter opener's own settings. */
export interface ChapterPageSettings {
  numbered: boolean;
  onNumberedChange: (numbered: boolean) => void;
  hasFacingPage: boolean;
  onFacingPageChange: (on: boolean) => void;
}

/**
 * The right panel's Page tab: the page the deck is on, and what it can be.
 *
 * Top to bottom: which page this is; what kind of page it is, for the pages a
 * cook might make their own (covers, the opening page, the book's own pages);
 * then only the settings that kind has. Quick actions (delete, move) stay in
 * the floating bar over the page, which a phone still needs.
 */
export function PageSettings({
  page,
  kindLabel,
  pageType,
  imagePicker,
  coverPhoto,
  recipe,
  chapter,
  emptyLines,
  onChoosePhoto,
}: {
  page: NavItem | null;
  /** What to call this page when its kind alone is too broad. */
  kindLabel?: string;
  /** For pages that can be made into another kind: which kinds, and which. */
  pageType?: { value: PageType; options: PageType[]; onChange: (type: PageType) => void } | null;
  /** The control that picks a "Full image" page's image. */
  imagePicker?: ReactNode;
  /** A theme-designed cover's or opening page's photo. */
  coverPhoto?: { value: CoverPhoto; onChange: (photo: CoverPhoto) => void } | null;
  recipe?: RecipePageSettings | null;
  chapter?: ChapterPageSettings | null;
  /** The toolbar's "Add …" reveal: the page's empty lines, shown to fill in. */
  emptyLines?: { shown: boolean; onToggle: () => void } | null;
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

  const type = pageType?.value ?? "design";
  const designed = type === "design";

  return (
    <div className="recipe-page-settings">
      <div className="recipe-config-section">
        <span className="recipe-config-label">{kindLabel ?? pageKindName(page.kind)}</span>
        {page.label && page.label !== kindLabel && page.kind !== "blank" && (
          <p className="recipe-page-settings__title">{page.label}</p>
        )}
      </div>

      {pageType && (
        <div className="recipe-config-section">
          <span className="recipe-config-label" id="recipe-page-type-label">
            Page type
          </span>
          <div
            className="recipe-page-settings__choices"
            style={{ gridTemplateColumns: `repeat(${pageType.options.length}, 1fr)` }}
            role="radiogroup"
            aria-labelledby="recipe-page-type-label"
          >
            {pageType.options.map((option) => (
              <SelectTile key={option} selected={type === option} className="recipe-page-settings__choice">
                <input
                  type="radio"
                  name="recipe-page-type"
                  className="sr-only"
                  checked={type === option}
                  onChange={() => pageType.onChange(option)}
                />
                <span>{PAGE_TYPE_LABELS[option]}</span>
              </SelectTile>
            ))}
          </div>
          {type === "image" && (
            <>
              {imagePicker}
              <p className="recipe-page-settings__note">
                Your image fills the page, with nothing from the theme on it.
              </p>
            </>
          )}
          {type === "blank" && <p className="recipe-page-settings__note">Prints with nothing on it.</p>}
        </div>
      )}

      {designed && coverPhoto && (
        <div className="recipe-config-section">
          <span className="recipe-config-label" id="recipe-page-cover-photo-label">
            Photo
          </span>
          <div
            className="recipe-page-settings__choices"
            role="radiogroup"
            aria-labelledby="recipe-page-cover-photo-label"
          >
            {COVER_PHOTO_OPTIONS.map((option) => (
              <SelectTile
                key={option.id}
                selected={coverPhoto.value === option.id}
                className="recipe-page-settings__choice"
              >
                <input
                  type="radio"
                  name="recipe-page-cover-photo"
                  className="sr-only"
                  checked={coverPhoto.value === option.id}
                  onChange={() => coverPhoto.onChange(option.id)}
                />
                <span>{option.label}</span>
              </SelectTile>
            ))}
          </div>
          {coverPhoto.value !== "typographic" && onChoosePhoto && (
            <button type="button" className="btn btn-secondary btn-compact" onClick={onChoosePhoto}>
              {coverPhoto.value === "collage" ? "Choose photos" : "Choose photo"}
            </button>
          )}
        </div>
      )}

      {recipe && (
        <>
          <div className="recipe-config-section">
            <span className="recipe-config-label" id="recipe-page-photo-label">
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

          <div className="recipe-config-section">
            <Checkbox
              label="Recipe link"
              hint={recipe.hasLink ? undefined : "This recipe has no link yet."}
              checked={recipe.hasLink && recipe.linkShown}
              disabled={!recipe.hasLink}
              onChange={(event) => recipe.onLinkShownChange(event.target.checked)}
            />
          </div>

          {/* Only once there is somewhere else to put it. */}
          {recipe.chapters.length > 1 && (
            <label className="recipe-config-section">
              <span className="recipe-config-label">Chapter</span>
              <Select
                variant="compact"
                value={recipe.chapterId ?? ""}
                onChange={(event) => recipe.onChapterChange(event.target.value)}
              >
                {recipe.chapters.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </>
      )}

      {chapter && (
        <div className="recipe-config-section">
          <Checkbox
            label="Number this chapter"
            checked={chapter.numbered}
            onChange={(event) => chapter.onNumberedChange(event.target.checked)}
          />
          <Checkbox
            label="Photo page beside it"
            checked={chapter.hasFacingPage}
            onChange={(event) => chapter.onFacingPageChange(event.target.checked)}
          />
        </div>
      )}

      {designed && emptyLines && (
        <div className="recipe-config-section">
          <Checkbox
            label="Show empty lines"
            hint="Lines this page can hold, ready to fill in on the page."
            checked={emptyLines.shown}
            onChange={() => emptyLines.onToggle()}
          />
        </div>
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
    case "blank":
      return "Your page";
  }
}
