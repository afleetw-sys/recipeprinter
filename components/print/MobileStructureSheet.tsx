"use client";

import type { Dispatch, SetStateAction } from "react";
import { Checkbox, SelectTile } from "@/components/Controls";
import { ChevronDownIcon, TrashIcon, PlusIcon, ICON_SIZE } from "@/components/icons";
import { MobileSheet } from "@/components/print/MobileSheet";
import { PHOTO_STYLE_OPTIONS, PhotoStylePreview } from "@/components/print/photoStyle";
import { ChapterNameInput } from "@/components/print/ChapterNameInput";
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
  bookSheet: MobileBookSheet;
  setBookSheet: Dispatch<SetStateAction<MobileBookSheet>>;
  structureSheetOpen: boolean;
  setStructureSheetOpen: Dispatch<SetStateAction<boolean>>;
}

/** Which of the book-wide sheets is open, from the bottom bar's tiles. */
export type MobileBookSheet = "extras" | "photos" | null;

/**
 * The mobile cookbook sheets. Desktop uses the page rail and the Book
 * Settings panel instead; these are the touch-native equivalents, since the
 * mobile config drawer only ever opens the Themes section.
 *
 * - "Extra pages" and "Photos" (each its own tile in the bottom bar): the
 *   book-wide settings. They used to share one "Book" sheet, which made a
 *   cook open a settings sheet to find either one.
 * - "Pages" (the floating page-sorter button over the deck): the reorderable
 *   list of chapters and recipes.
 *
 * The structure list used to sit under the settings too. It is what a cook
 * comes back to again and again, and it answers a different question from
 * how the book is set up, so it has its own way in.
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
  bookSheet,
  setBookSheet,
  structureSheetOpen,
  setStructureSheetOpen,
}: MobileStructureSheetProps) {
    if (!projectMeta.meta.cookbookMode) return null;
    const orderedIds = sections.flatMap((section) => section.items.map((item) => item.id));
    const recipeCount = orderedIds.length;
    const metaSections = projectMeta.meta.sections;
    return (
      <>
        <MobileSheet
          open={bookSheet === "extras"}
          onClose={() => setBookSheet(null)}
          title="Extra pages"
          className="recipe-structure-sheet"
        >
            {/* The same controls as the desktop "Book Settings" panel's
                Extra pages group. */}
            <div className="recipe-structure-sheet__settings">
              <Checkbox
                  label="Dedication"
                  checked={Boolean(projectMeta.meta.frontMatter || projectMeta.meta.dedication)}
                  onChange={toggleDedication}
              />
              <Checkbox
                  label="Table of contents"
                  checked={Boolean(projectMeta.meta.tableOfContents)}
                  onChange={(event) => projectMeta.setTableOfContents(event.target.checked)}
              />
            </div>
        </MobileSheet>

        <MobileSheet
          open={bookSheet === "photos"}
          onClose={() => setBookSheet(null)}
          title="Photos"
          className="recipe-structure-sheet"
        >
            <div className="recipe-structure-sheet__settings">
              {/* The tiles change nothing on screen until a recipe has a
                  photo, so a new book can look as though they are broken.
                  Same note the desktop panel gives. */}
              {!anyRecipeHasImage && (
                <p className="recipe-structure-sheet__note">
                  Add a photo to a recipe to see these layouts on its page.
                </p>
              )}
              <div
                className="recipe-photo-style"
                role="radiogroup"
                aria-label="Photo layout"
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
            </div>
        </MobileSheet>

        <MobileSheet
          open={structureSheetOpen}
          onClose={() => setStructureSheetOpen(false)}
          title="Pages"
          subtitle={
            <>
              {recipeCount} {recipeCount === 1 ? "recipe" : "recipes"} ·{" "}
              {namedSectionCount(sections)}{" "}
              {namedSectionCount(sections) === 1 ? "chapter" : "chapters"}
            </>
          }
          ariaLabel="Pages and structure"
          className="recipe-structure-sheet"
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={addStructureSection}
              >
                <PlusIcon size={ICON_SIZE.sm} />
                Add chapter
              </button>
            </>
          }
        >
            {sections.map((section) => {
              const metaIndex = metaSections.findIndex((candidate) => candidate.id === section.id);
              const canSectionUp = metaIndex > 0;
              const canSectionDown = metaIndex !== -1 && metaIndex < metaSections.length - 1;
              const showSectionChrome = sections.length > 1 || Boolean(section.title);
              return (
                <section className="recipe-structure-sheet__section" key={section.id}>
                  {showSectionChrome && (
                    <div className="recipe-structure-sheet__section-head">
                      <ChapterNameInput
                        className="recipe-structure-sheet__section-title"
                        value={section.title ?? ""}
                        placeholder="Chapter name"
                        aria-label="Chapter name"
                        onRename={(value) => renameSectionEverywhere(section.id, value)}
                      />
                      <div className="recipe-structure-sheet__move">
                        <button
                          type="button"
                          className="recipe-structure-sheet__move-up"
                          aria-label="Move chapter up"
                          disabled={!canSectionUp}
                          onClick={() => moveSectionInBook(section.id, -1)}
                        >
                          <ChevronDownIcon size={ICON_SIZE.sm} />
                        </button>
                        <button
                          type="button"
                          className="recipe-structure-sheet__move-down"
                          aria-label="Move chapter down"
                          disabled={!canSectionDown}
                          onClick={() => moveSectionInBook(section.id, 1)}
                        >
                          <ChevronDownIcon size={ICON_SIZE.sm} />
                        </button>
                        <button
                          type="button"
                          className="recipe-structure-sheet__delete"
                          aria-label={`Delete ${section.title || "chapter"}`}
                          title="Delete chapter"
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
                        No recipes yet. Use the arrows to move one into this chapter.
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
        </MobileSheet>
      </>
    );
}
