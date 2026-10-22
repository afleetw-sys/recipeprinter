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

export type PageLayout = "typographic" | "photo" | "collage";

/** A cover's or the opening page's own settings. */
export interface CoverPageSettings {
  layout: PageLayout;
  onLayoutChange: (layout: PageLayout) => void;
  /** The opening page only: what kind of page it is. */
  frontMatterKind?: "dedication" | "introduction";
  onFrontMatterKindChange?: (kind: "dedication" | "introduction") => void;
}

/** A chapter opener's own settings. */
export interface ChapterPageSettings {
  numbered: boolean;
  onNumberedChange: (numbered: boolean) => void;
  hasFacingPage: boolean;
  onFacingPageChange: (on: boolean) => void;
}

const LAYOUT_OPTIONS: Array<{ id: PageLayout; label: string }> = [
  { id: "typographic", label: "Words" },
  { id: "photo", label: "Photo" },
  { id: "collage", label: "Collage" },
];

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
  cover,
  chapter,
  emptyLines,
  kindLabel,
  onChoosePhoto,
}: {
  page: NavItem | null;
  recipe?: RecipePageSettings | null;
  cover?: CoverPageSettings | null;
  chapter?: ChapterPageSettings | null;
  /** The toolbar's "Add …" reveal: the page's empty lines, shown to fill in. */
  emptyLines?: { shown: boolean; onToggle: () => void } | null;
  /** What to call this page when its kind alone is too broad: the three
      cover-like pages share one kind. */
  kindLabel?: string;
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
      <span className="recipe-config-label">{kindLabel ?? pageKindName(page.kind)}</span>
      {page.label && page.kind !== "blank" && page.label !== kindLabel && (
        <p className="recipe-page-settings__title">{page.label}</p>
      )}

      {cover?.onFrontMatterKindChange && (
        <label className="recipe-page-settings__field">
          <span className="recipe-config-sublabel">Page</span>
          <Select
            variant="compact"
            value={cover.frontMatterKind ?? "dedication"}
            onChange={(event) =>
              cover.onFrontMatterKindChange?.(event.target.value as "dedication" | "introduction")
            }
          >
            <option value="dedication">Dedication</option>
            <option value="introduction">Introduction</option>
          </Select>
        </label>
      )}

      {cover && (
        <div className="recipe-photo-style-group">
          <span className="recipe-config-sublabel" id="recipe-page-layout-label">
            Layout
          </span>
          <div
            className="recipe-page-settings__layouts"
            role="radiogroup"
            aria-labelledby="recipe-page-layout-label"
          >
            {LAYOUT_OPTIONS.map((option) => (
              <SelectTile
                key={option.id}
                selected={cover.layout === option.id}
                className="recipe-page-settings__layout"
              >
                <input
                  type="radio"
                  name="recipe-page-layout"
                  className="sr-only"
                  checked={cover.layout === option.id}
                  onChange={() => cover.onLayoutChange(option.id)}
                />
                <span>{option.label}</span>
              </SelectTile>
            ))}
          </div>
          {cover.layout !== "typographic" && onChoosePhoto && (
            <button type="button" className="btn btn-secondary btn-compact" onClick={onChoosePhoto}>
              {cover.layout === "collage" ? "Choose photos" : "Choose photo"}
            </button>
          )}
        </div>
      )}

      {chapter && (
        <>
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
        </>
      )}

      {emptyLines && (
        <Checkbox
          label="Show empty lines"
          hint="The lines this page can hold, ready to fill in on the page."
          checked={emptyLines.shown}
          onChange={() => emptyLines.onToggle()}
        />
      )}

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

      {!recipe && !cover && onChoosePhoto && page.kind !== "toc" && page.kind !== "blank" && (
        <button type="button" className="btn btn-secondary btn-compact" onClick={onChoosePhoto}>
          Photo
        </button>
      )}

      {page.kind === "blank" && (
        <p className="recipe-page-settings__note">
          Prints with nothing on it, for notes or to start what follows on a new page.
        </p>
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
      return "Blank page";
  }
}
