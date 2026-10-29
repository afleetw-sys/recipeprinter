"use client";

import type { RefObject } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { MenuRow, MenuSelect } from "@/components/MenuSelect";
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
  const options = textSizeOptions(proMarked);
  return (
    <div className="recipe-config-section recipe-config-section--text-size">
      <span className="recipe-config-label">Text size</span>
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
