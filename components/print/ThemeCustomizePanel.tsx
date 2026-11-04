"use client";

import { useId, useState, type CSSProperties } from "react";
import { ProBadge } from "@/components/ProBadge";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ICON_SIZE, UndoIcon } from "@/components/icons";
import { StepSizeControl, TextSizeControl } from "@/components/print/TextSizeControl";
import { SizeDropdown } from "@/components/print/TextFieldToolbar";
import type { FontScale } from "@/lib/fontScale";
import {
  DEFAULT_PHOTO_SCALE,
  PHOTO_SCALES,
  PHOTO_SCALE_LABELS,
  normalizePhotoScale,
  type PhotoScale,
} from "@/lib/photoScale";
import {
  POSTER_COLORS,
  SUPPER_UTENSILS,
  THEME_ACCENTS,
  THEME_PALETTES,
  type AccentColor,
  type SupperUtensil,
} from "@/lib/themeAccent";
import { MenuSelect } from "@/components/MenuSelect";
import type { RecipePrintTemplate } from "@/types/recipe";

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
  accent,
  setAccent,
  posterColor,
  setPosterColor,
  utensil,
  setUtensil,
  template,
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
  /** The theme's accent color, null for its own (lib/themeAccent.ts). */
  accent: AccentColor | null;
  setAccent: (value: AccentColor | null) => void;
  /** Poster's band color for every recipe, null while they take turns. */
  posterColor: number | null;
  setPosterColor: (value: number | null) => void;
  /** Supper's utensil for every recipe, null while they take turns. */
  utensil: SupperUtensil | null;
  setUtensil: (value: SupperUtensil | null) => void;
  /** Which theme, for its own colors and art choices. */
  template: RecipePrintTemplate;
  /** Whether this theme differs from how it ships. */
  customized: boolean;
  onReset: () => void;
  onBack: () => void;
  /** Fine-tune sizes: the size every recipe's part has (lib/pageLooks.tsx,
      `RECIPES_ADDRESS`), and its setter. Absent = no Fine-tune sizes section. */
  recipePartSizes?: Record<string, { textSize?: number }>;
  setRecipePartSize?: (part: string, size: number | undefined) => void;
}) {
  const photoLabel = cookbook ? "Recipe photo size" : "Photo size";
  // Art that takes turns does so by chapter in a book (every recipe in a
  // chapter shares one) and by recipe on cards (`styleIndex` in
  // lib/usePrintSheets.tsx), so the choice says which.
  const alternating = cookbook ? "Alternating by chapter" : "Alternating by recipe";
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

      {THEME_PALETTES[template] && (
        <SwatchControl
          label="Accent color"
          first={{ label: "Default", background: THEME_ACCENTS[template] }}
          options={THEME_PALETTES[template]!.map((option) => ({ value: option.id, label: option.label, background: option.hex }))}
          value={accent}
          onChange={setAccent}
          proMarked={proMarked}
          proTooltip="This accent color is Pro"
        />
      )}
      {template === "poster" && (
        <SwatchControl
          label="Band color"
          first={{
            label: alternating,
            // Every band color around the swatch: they take turns.
            background: `conic-gradient(${POSTER_COLORS.map((color) => color.hex).join(", ")})`,
          }}
          options={POSTER_COLORS.map((color, index) => ({ value: index, label: color.label, background: color.hex }))}
          value={posterColor}
          onChange={setPosterColor}
          proMarked={proMarked}
          proTooltip="One band color is Pro"
        />
      )}
      {template === "supper" && (
        <div className="recipe-config-section">
          <span className="recipe-config-label">Utensil</span>
          <MenuSelect
            label="Utensil"
            labelHidden
            placeholder={alternating}
            clearLabel={alternating}
            value={utensil}
            options={SUPPER_UTENSILS.map((piece) => ({
              value: piece,
              label: piece[0].toUpperCase() + piece.slice(1),
              badge: proMarked ? <ProBadge variant="inline" label={false} tooltip="One utensil is Pro" /> : undefined,
            }))}
            onChange={setUtensil}
          />
        </div>
      )}

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
        <StepSizeControl
          label={photoLabel}
          steps={PHOTO_SCALES}
          labels={PHOTO_SCALE_LABELS}
          value={normalizePhotoScale(photoScale)}
          defaultValue={DEFAULT_PHOTO_SCALE}
          onChange={setPhotoScale}
          proMarked={proMarked}
          proTooltip="This photo size is Pro"
        />
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
          <p className="recipe-customize__defaults">
            <CheckIcon size={ICON_SIZE.sm} />
            Using theme defaults
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One pick among round swatches: the theme as it ships first (its own accent,
 * or Poster's bands taking turns), then the theme's own few choices
 * (lib/themeAccent.ts). A radio group, with the name of the one chosen across
 * from the heading the way Text size names its step.
 */
function SwatchControl<T extends string | number>({
  label,
  first,
  options,
  value,
  onChange,
  proMarked,
  proTooltip,
}: {
  label: string;
  first: { label: string; background: string };
  options: Array<{ value: T; label: string; background: string }>;
  value: T | null;
  onChange: (value: T | null) => void;
  proMarked: boolean;
  proTooltip: string;
}) {
  const labelId = useId();
  const all: Array<{ value: T | null; label: string; background: string }> = [
    { value: null, label: first.label, background: first.background },
    ...options,
  ];
  const current = all.find((option) => option.value === value) ?? all[0];
  return (
    <div className="recipe-config-section">
      <div className="recipe-text-size__head">
        <span className="recipe-config-label" id={labelId}>
          {label}
        </span>
        <span className="recipe-text-size__name">
          {proMarked && value !== null && <ProBadge variant="inline" label={false} tooltip={proTooltip} />}
          {current.label}
        </span>
      </div>
      <div className="recipe-accent-swatches" role="radiogroup" aria-labelledby={labelId}>
        {all.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            aria-label={option.label}
            title={option.label}
            className={`recipe-accent-swatch ${option.value === value ? "is-selected" : ""}`}
            style={{ "--swatch": option.background } as CSSProperties}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

/** The parts of a recipe page, in the order they sit on it, and what each is
    called here. */
const RECIPE_PARTS: Array<{ element: string; label: string }> = [
  { element: "title", label: "Titles" },
  { element: "notes", label: "Notes" },
  { element: "details", label: "Time, servings and link" },
  { element: "ingredients-headings", label: "Ingredient headings" },
  { element: "ingredients", label: "Ingredients" },
  { element: "steps-headings", label: "Step headings" },
  { element: "steps", label: "Steps" },
];

/**
 * Fine-tune sizes: a size for one part of every recipe at once (all the steps, all
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
  // Closed until wanted: most books only ever need Text size. Open from the
  // start when some part already has a size of its own, so it isn't hidden.
  const [open, setOpen] = useState(() =>
    Object.values(sizes ?? {}).some((part) => part.textSize !== undefined),
  );
  const drawn = (element: string) =>
    document.querySelector<HTMLElement>(
      `.recipe-page-canvas [data-element-page^="recipe:"][data-element="${element}"]`,
    );
  const parts = typeof document === "undefined" ? [] : RECIPE_PARTS.filter((part) => drawn(part.element));
  if (parts.length === 0) return null;
  return (
    <div className="recipe-config-section recipe-customize__parts">
      <button
        type="button"
        className="recipe-template-seasonal-toggle recipe-customize__parts-toggle"
        aria-expanded={open}
        aria-controls="recipe-customize-part-rows"
        onClick={() => setOpen(!open)}
      >
        Fine-tune sizes
        <ChevronDownIcon size={ICON_SIZE.sm} />
      </button>
      {open && (
        <div id="recipe-customize-part-rows">
          <p className="recipe-customize__parts-hint">Text size still moves them all.</p>
          <div className="recipe-customize__part-rows">
            {parts.map((part) => (
              <div key={part.element} className="recipe-customize__part-row">
                <span className="recipe-customize__part-label">{part.label}</span>
                <SizeDropdown
                  partLabel={part.label}
                  partHeading={false}
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
      )}
    </div>
  );
}
