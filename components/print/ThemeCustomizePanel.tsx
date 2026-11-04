"use client";

import { MenuSelect } from "@/components/MenuSelect";
import { ProBadge } from "@/components/ProBadge";
import { ChevronLeftIcon, ICON_SIZE, UndoIcon } from "@/components/icons";
import { TextSizeControl } from "@/components/print/TextSizeControl";
import { SizeDropdown } from "@/components/print/TextFieldToolbar";
import type { FontScale } from "@/lib/fontScale";
import {
  DEFAULT_PHOTO_SCALE,
  PHOTO_SCALES,
  PHOTO_SCALE_LABELS,
  normalizePhotoScale,
  type PhotoScale,
} from "@/lib/photoScale";

/**
 * The settings panel's Customize view: everything about how the current theme
 * LOOKS, which that theme keeps as its own (lib/themeLooks.ts). What the book
 * holds and how it prints stay on the main view, since they survive a theme
 * switch and these don't.
 *
 * On a free recipe card all of it is Pro, but like a Pro theme it can be tried
 * here and only Print asks. The crown on the heading says so, as it does on
 * every other Pro choice.
 */
export function ThemeCustomizePanel({
  cookbook,
  proMarked,
  photosShown,
  fontScale,
  setFontScale,
  photoScale,
  setPhotoScale,
  customized,
  onReset,
  onBack,
  recipePartSizes,
  setRecipePartSize,
}: {
  cookbook: boolean;
  /** A free account on recipe cards: crown everything but each default. */
  proMarked: boolean;
  /** Whether any recipe page draws a photo, so a photo size would show. */
  photosShown: boolean;
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  photoScale: PhotoScale;
  setPhotoScale: (value: PhotoScale) => void;
  /** Whether this theme differs from how it ships. */
  customized: boolean;
  onReset: () => void;
  onBack: () => void;
  /** Each part: the size every recipe's part has (lib/pageLooks.tsx,
      `RECIPES_ADDRESS`), and its setter. Absent = no Each part section. */
  recipePartSizes?: Record<string, { textSize?: number }>;
  setRecipePartSize?: (part: string, size: number | undefined) => void;
}) {
  const photoLabel = cookbook ? "Recipe photo size" : "Photo size";
  return (
    <div className="recipe-config-section recipe-config-section--customize">
      <div className="recipe-customize__header">
        <button type="button" className="recipe-customize__back" onClick={onBack} aria-label="Back to themes">
          <ChevronLeftIcon size={ICON_SIZE.sm} />
          Themes
        </button>
        <h3 className="recipe-customize__title">
          Customize theme
          {proMarked && <ProBadge variant="inline" label={false} tooltip="Customizing a theme is Pro" />}
        </h3>
      </div>

      <TextSizeControl fontScale={fontScale} setFontScale={setFontScale} proMarked={proMarked} />

      {setRecipePartSize && (
        <EachPartSizes
          fontScale={fontScale}
          sizes={recipePartSizes}
          setSize={setRecipePartSize}
          proMarked={proMarked}
        />
      )}

      {photosShown && (
        <div className="recipe-config-section">
          <span className="recipe-config-label">{photoLabel}</span>
          <MenuSelect
            label={photoLabel}
            labelHidden
            placeholder={PHOTO_SCALE_LABELS[photoScale]}
            value={String(photoScale)}
            options={PHOTO_SCALES.map((scale) => ({
              value: String(scale),
              label: PHOTO_SCALE_LABELS[scale],
              badge:
                proMarked && scale !== DEFAULT_PHOTO_SCALE ? (
                  <ProBadge variant="inline" label={false} tooltip="This photo size is Pro" />
                ) : undefined,
            }))}
            onChange={(value) => setPhotoScale(normalizePhotoScale(Number(value)))}
          />
        </div>
      )}

      {/* Pinned to the panel's foot, under whatever scrolls above it. A
          theme as it ships has nothing to reset, so the foot just says so. */}
      <div className="recipe-customize__foot">
        {customized ? (
          <button type="button" className="btn-ghost btn-compact recipe-customize__reset" onClick={onReset}>
            <UndoIcon size={ICON_SIZE.sm} />
            Reset to theme defaults
          </button>
        ) : (
          <p className="recipe-customize__defaults">Using theme defaults</p>
        )}
      </div>
    </div>
  );
}

/** The parts of a recipe page, in the order they sit on it, and what each is
    called here. */
const RECIPE_PARTS: Array<{ element: string; label: string }> = [
  { element: "title", label: "Titles" },
  { element: "notes", label: "Notes" },
  { element: "details", label: "Time and servings" },
  { element: "ingredients-headings", label: "Ingredient headings" },
  { element: "ingredients", label: "Ingredients" },
  { element: "steps-headings", label: "Step headings" },
  { element: "steps", label: "Steps" },
];

/**
 * Each part: a size for one part of every recipe at once (all the steps, all
 * the titles), on top of Text size. Text size still moves everything; a part
 * set here keeps its size relative to it, and a size picked in the text bar
 * on one recipe still wins on that recipe. Each row is the text bar's own size
 * dropdown, with Text size's size marked Default.
 *
 * A part shows here once some recipe page draws it, since its size in points
 * is read off the page (each theme sets its own).
 */
function EachPartSizes({
  fontScale,
  sizes,
  setSize,
  proMarked,
}: {
  fontScale: number;
  sizes: Record<string, { textSize?: number }> | undefined;
  setSize: (part: string, size: number | undefined) => void;
  proMarked: boolean;
}) {
  const drawn = (element: string) =>
    document.querySelector<HTMLElement>(
      `.recipe-page-canvas [data-element-page^="recipe:"][data-element="${element}"]`,
    );
  const parts = typeof document === "undefined" ? [] : RECIPE_PARTS.filter((part) => drawn(part.element));
  if (parts.length === 0) return null;
  return (
    <div className="recipe-config-section recipe-customize__parts">
      <span className="recipe-config-label">Each part</span>
      <p className="recipe-customize__parts-hint">For every recipe. Text size still moves them all.</p>
      <div className="recipe-customize__part-rows">
        {parts.map((part) => (
          <div key={part.element} className="recipe-customize__part-row">
            <span className="recipe-customize__part-label">{part.label}</span>
            <SizeDropdown
              partLabel={part.label}
              getNode={() => drawn(part.element)}
              defaultScale={fontScale}
              size={sizes?.[part.element]?.textSize}
              proMarked={proMarked}
              onChange={(size) => setSize(part.element, size)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
