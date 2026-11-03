"use client";

import type { CSSProperties } from "react";
import { ProBadge } from "@/components/ProBadge";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALES,
  FONT_SCALE_LABELS,
  type FontScale,
} from "@/lib/fontScale";

/**
 * The cook's text size for every recipe page, picked from a list of words
 * (Smallest … Largest), never a percentage: nobody knows what 92% looks like.
 *
 * Normal is free; every other size is Pro on recipe cards. Like a Pro theme or
 * the 4×6 size, a free account can still pick and preview one: the crown marks
 * it and only Print asks for Pro (`fontScaleLocked`).
 *
 * The settings panel's text size: a slider over the five steps, with the
 * step's name across from the heading. Steps, never a free value: every one
 * is measured by the layout harness.
 */
export function TextSizeControl({
  fontScale,
  setFontScale,
  proMarked,
}: {
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  /** Crown every size but Normal: recipe cards on a free account. */
  proMarked: boolean;
}) {
  const index = FONT_SCALES.indexOf(fontScale);
  const position = index < 0 ? FONT_SCALES.indexOf(DEFAULT_FONT_SCALE) : index;
  return (
    <div className="recipe-config-section recipe-config-section--text-size">
      <div className="recipe-text-size__head">
        <span className="recipe-config-label" id="recipe-text-size-label">
          Text size
        </span>
        <span className="recipe-text-size__name">
          {proMarked && fontScale !== DEFAULT_FONT_SCALE && (
            <ProBadge variant="inline" label={false} tooltip="This text size is Pro" />
          )}
          {FONT_SCALE_LABELS[fontScale]}
        </span>
      </div>
      <div
        className="recipe-text-size__slider"
        style={{ "--fill": `${(position / (FONT_SCALES.length - 1)) * 100}%` } as CSSProperties}
      >
        <input
          type="range"
          min={0}
          max={FONT_SCALES.length - 1}
          step={1}
          value={position}
          aria-labelledby="recipe-text-size-label"
          aria-valuetext={FONT_SCALE_LABELS[fontScale]}
          onChange={(event) => setFontScale(FONT_SCALES[Number(event.target.value)] ?? DEFAULT_FONT_SCALE)}
        />
        <span className="recipe-text-size__ticks" aria-hidden>
          {FONT_SCALES.map((scale, i) => (
            <span key={scale} className={i === position ? "is-selected" : undefined} />
          ))}
        </span>
      </div>
    </div>
  );
}
