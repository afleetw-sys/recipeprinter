"use client";

import type { CSSProperties, RefObject } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { MenuRow } from "@/components/MenuSelect";
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
 * (Smaller … Larger), never a percentage: nobody knows what 92% looks like.
 *
 * Normal is free; every other size is Pro on recipe cards. Like a Pro theme or
 * the 4×6 size, a free account can still pick and preview one: the crown marks
 * it and only Print asks for Pro (`fontScaleLocked`).
 */
function textSizeOptions(proMarked: boolean) {
  return FONT_SCALES.map((scale) => ({
    value: String(scale),
    label: FONT_SCALE_LABELS[scale],
    badge:
      proMarked && scale !== DEFAULT_FONT_SCALE ? (
        <ProBadge variant="inline" label={false} tooltip="This text size is Pro" />
      ) : undefined,
  }));
}

/**
 * The phone toolbar's Text size: the sizes open right against the tile, one
 * tap to pick, rather than a sheet holding a second dropdown. Mount it while
 * open.
 */
export function TextSizeMenu({
  anchorRef,
  onClose,
  fontScale,
  setFontScale,
  proMarked,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  proMarked: boolean;
}) {
  return (
    <AnchoredMenu anchorRef={anchorRef} onClose={onClose} label="Text size" align="end" className="menu-select__menu">
      {textSizeOptions(proMarked).map((option) => (
        <MenuRow
          key={option.value}
          selected={option.value === String(fontScale)}
          onSelect={() => {
            setFontScale(normalizeFontScale(Number(option.value)));
            onClose();
          }}
          badge={option.badge}
        >
          {option.label}
        </MenuRow>
      ))}
    </AnchoredMenu>
  );
}

/**
 * The settings panel's text size: a slider over the five steps, with the
 * step's name across from the heading, drawn at that size, so the cook sees the change before
 * they look at the page. Steps, never a free value: every one is measured by
 * the layout harness.
 */
export function TextSizeControl({
  fontScale,
  setFontScale,
  proMarked,
  cookbook = false,
}: {
  fontScale: FontScale;
  setFontScale: (value: FontScale) => void;
  /** Crown every size but Normal: recipe cards on a free account. */
  proMarked: boolean;
  /** In a book it sizes the recipe pages only, not the cover, dedication or
      chapter openers, and a cook who wanted a bigger dedication took "Text
      size" to mean the whole book. So there it says which pages it means. */
  cookbook?: boolean;
}) {
  const label = cookbook ? "Recipe text size" : "Text size";
  const index = FONT_SCALES.indexOf(fontScale);
  const position = index < 0 ? FONT_SCALES.indexOf(DEFAULT_FONT_SCALE) : index;
  return (
    <div className="recipe-config-section recipe-config-section--text-size">
      <div className="recipe-text-size__head">
        <span className="recipe-config-label" id="recipe-text-size-label">
          {label}
        </span>
        <span className="recipe-text-size__name" style={{ fontSize: `calc(var(--cp-fs-body) * ${fontScale})` }}>
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
