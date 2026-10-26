"use client";

import { MenuSelect } from "@/components/MenuSelect";
import { ProBadge } from "@/components/ProBadge";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALES,
  FONT_SCALE_LABELS,
  normalizeFontScale,
  type FontScale,
} from "@/lib/fontScale";

/**
 * The cook's text size for every recipe page, picked from a list of words
 * (Smallest … Biggest), never a percentage: nobody knows what 92% looks like.
 *
 * Normal is free; every other size is Pro on recipe cards. Like a Pro theme or
 * the 4×6 size, a free account can still pick and preview one: the crown marks
 * it and only Print asks for Pro (`fontScaleLocked`).
 */
export function TextSizeControl({
  fontScale,
  setFontScale,
  proMarked,
  labelHidden = false,
}: {
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  /** Crown every size but Normal: recipe cards on a free account. */
  proMarked: boolean;
  /** No heading of its own: a sheet titled "Text size" already says it. */
  labelHidden?: boolean;
}) {
  const options = FONT_SCALES.map((scale) => ({
    value: String(scale),
    label: FONT_SCALE_LABELS[scale],
    badge:
      proMarked && scale !== DEFAULT_FONT_SCALE ? (
        <ProBadge variant="inline" label={false} tooltip="This text size is Pro" />
      ) : undefined,
  }));
  return (
    <div className="recipe-config-section recipe-config-section--text-size">
      {!labelHidden && <span className="recipe-config-label">Text size</span>}
      <MenuSelect
        label="Text size"
        labelHidden
        placeholder={FONT_SCALE_LABELS[fontScale]}
        value={String(fontScale)}
        options={options}
        onChange={(value) => setFontScale(normalizeFontScale(Number(value)))}
      />
    </div>
  );
}
