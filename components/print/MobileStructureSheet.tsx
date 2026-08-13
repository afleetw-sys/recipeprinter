"use client";

import type { Dispatch, SetStateAction } from "react";
import { Checkbox, SelectTile } from "@/components/Controls";
import {
  XIcon,
  ChevronDownIcon,
  TrashIcon,
  PlusIcon,
  RefreshIcon,
  ICON_SIZE,
} from "@/components/icons";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import { namedSectionCount, useProjectMeta, type PhotoStyle } from "@/lib/project";
import type { Section } from "@/types/recipe";

interface MobileStructureSheetProps {
  projectMeta: ReturnType<typeof useProjectMeta>;
  sections: Section[];
  toggleDedication: () => void;
  anyRecipeHasImage: boolean;
  bookPhotoStyle: PhotoStyle | null;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  renameSectionEverywhere: (sectionId: string, value: string) => void;
  moveSectionInBook: (sectionId: string, direction: -1 | 1) => void;
  requestDeleteSection: (sectionId: string) => void;
  navigateToRecipe: (itemId: string) => void;
  moveRecipeInBook: (itemId: string, direction: -1 | 1) => void;
  addStructureSection: () => void;
  suggestCookbookLayout: () => void;
  structureSheetOpen: boolean;
  setStructureSheetOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * The mobile "Book" bottom sheet: book-wide settings (table of contents,
 * opening page, photos) plus a reorderable list of sections and recipes.
 * Desktop uses the page rail and the Book Settings panel instead; this is the
 * touch-native equivalent, since the mobile config drawer only ever opens the
 * Themes section.
 */
export function MobileStructureSheet({
  projectMeta,
  sections,
  toggleDedication,
  anyRecipeHasImage,
  bookPhotoStyle,
  applyBookPhotoStyle,
  renameSectionEverywhere,
  moveSectionInBook,
  requestDeleteSection,
  navigateToRecipe,
  moveRecipeInBook,
  addStructureSection,
  suggestCookbookLayout,
  structureSheetOpen,
  setStructureSheetOpen,
}: MobileStructureSheetProps) {
    if (!projectMeta.meta.cookbookMode) return null;
    const orderedIds = sections.flatMap((section) => section.items.map((item) => item.id));
    const recipeCount = orderedIds.length;
    const metaSections = projectMeta.meta.sections;
    return (
      <>
        {structureSheetOpen && (
          <button
            type="button"
            className="recipe-structure-sheet__backdrop no-print"
            aria-label="Close pages"
            onClick={() => setStructureSheetOpen(false)}
          />
        )}
        <aside
          className={`recipe-structure-sheet no-print ${structureSheetOpen ? "is-open" : ""}`}
          role="dialog"
          aria-modal={structureSheetOpen ? "true" : undefined}
          aria-label="Pages and structure"
          aria-hidden={structureSheetOpen ? undefined : "true"}
        >
          <div className="recipe-structure-sheet__grabber" aria-hidden />
          <header className="recipe-structure-sheet__header">
            <div>
              <h2>Book</h2>
              <span>
                {recipeCount} recipes · {namedSectionCount(sections)} sections
              </span>
            </div>
            <button
              type="button"
              className="icon-close-btn"
              aria-label="Close"
              onClick={() => setStructureSheetOpen(false)}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
          </header>

          <div className="recipe-structure-sheet__scroll">
            {/* Book-wide settings — the same controls as the desktop "Book
                Settings" panel, which the mobile config drawer never exposes
                (it only ever opens the Themes section). */}
            <div className="recipe-structure-sheet__settings">
              <Checkbox
                  label="Table of contents"
                  checked={Boolean(projectMeta.meta.tableOfContents)}
                  onChange={(event) => projectMeta.setTableOfContents(event.target.checked)}
              />
              <Checkbox
                  label="Opening page"
                  checked={Boolean(projectMeta.meta.frontMatter || projectMeta.meta.dedication)}
                  onChange={toggleDedication}
              />
              {anyRecipeHasImage && (
                <div className="recipe-structure-sheet__photos">
                  <span className="recipe-structure-sheet__group-label" id="sheet-photos-label">
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
                        title={option.hint}
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
                </div>
              )}
            </div>

            <span className="recipe-structure-sheet__group-label recipe-structure-sheet__group-label--structure">
              Structure
            </span>

            {sections.map((section) => {
              const metaIndex = metaSections.findIndex((candidate) => candidate.id === section.id);
              const canSectionUp = metaIndex > 0;
              const canSectionDown = metaIndex !== -1 && metaIndex < metaSections.length - 1;
              const showSectionChrome = sections.length > 1 || Boolean(section.title);
              return (
                <section className="recipe-structure-sheet__section" key={section.id}>
                  {showSectionChrome && (
                    <div className="recipe-structure-sheet__section-head">
                      <input
                        className="recipe-structure-sheet__section-title"
                        value={section.title ?? ""}
                        placeholder="Section name"
                        aria-label="Section name"
                        onChange={(event) =>
                          renameSectionEverywhere(section.id, event.target.value)
                        }
                      />
                      <div className="recipe-structure-sheet__move">
                        <button
                          type="button"
                          className="recipe-structure-sheet__move-up"
                          aria-label="Move section up"
                          disabled={!canSectionUp}
                          onClick={() => moveSectionInBook(section.id, -1)}
                        >
                          <ChevronDownIcon size={ICON_SIZE.sm} />
                        </button>
                        <button
                          type="button"
                          className="recipe-structure-sheet__move-down"
                          aria-label="Move section down"
                          disabled={!canSectionDown}
                          onClick={() => moveSectionInBook(section.id, 1)}
                        >
                          <ChevronDownIcon size={ICON_SIZE.sm} />
                        </button>
                        <button
                          type="button"
                          className="recipe-structure-sheet__delete"
                          aria-label={`Delete ${section.title || "section"}`}
                          title="Delete section"
                          onClick={() => requestDeleteSection(section.id)}
                        >
                          <TrashIcon size={ICON_SIZE.sm} />
                        </button>
                      </div>
                    </div>
                  )}
                  <ul className="recipe-structure-sheet__recipes">
                    {section.items.map((item) => {
                      const globalIndex = orderedIds.indexOf(item.id);
                      const title = item.recipe?.title || item.title;
                      return (
                        <li className="recipe-structure-sheet__recipe" key={item.id}>
                          <button
                            type="button"
                            className="recipe-structure-sheet__recipe-open"
                            onClick={() => navigateToRecipe(item.id)}
                          >
                            <span className="recipe-structure-sheet__recipe-num">
                              {globalIndex + 1}
                            </span>
                            <span className="recipe-structure-sheet__recipe-title">{title}</span>
                          </button>
                          <div className="recipe-structure-sheet__move">
                            <button
                              type="button"
                              className="recipe-structure-sheet__move-up"
                              aria-label={`Move ${title} up`}
                              disabled={globalIndex <= 0}
                              onClick={() => moveRecipeInBook(item.id, -1)}
                            >
                              <ChevronDownIcon size={ICON_SIZE.sm} />
                            </button>
                            <button
                              type="button"
                              className="recipe-structure-sheet__move-down"
                              aria-label={`Move ${title} down`}
                              disabled={globalIndex >= recipeCount - 1}
                              onClick={() => moveRecipeInBook(item.id, 1)}
                            >
                              <ChevronDownIcon size={ICON_SIZE.sm} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                    {section.items.length === 0 && (
                      <li className="recipe-structure-sheet__empty">
                        Empty — step a recipe here with the arrows above.
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>

          <footer className="recipe-structure-sheet__footer">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={addStructureSection}
            >
              <PlusIcon size={ICON_SIZE.sm} />
              Add section
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={suggestCookbookLayout}
            >
              <RefreshIcon size={ICON_SIZE.sm} />
              Suggest a layout
            </button>
          </footer>
        </aside>
      </>
    );
}
