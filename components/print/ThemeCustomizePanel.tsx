"use client";

import { MenuSelect } from "@/components/MenuSelect";
import { ProBadge } from "@/components/ProBadge";
import { ChevronLeftIcon, ICON_SIZE, UndoIcon } from "@/components/icons";
import { TextSizeControl } from "@/components/print/TextSizeControl";
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

      <TextSizeControl fontScale={fontScale} setFontScale={setFontScale} proMarked={proMarked} cookbook={cookbook} />

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

      {/* Pinned to the panel's foot, under whatever scrolls above it. */}
      {customized && (
        <div className="recipe-customize__foot">
          <button type="button" className="btn-ghost btn-compact recipe-customize__reset" onClick={onReset}>
            <UndoIcon size={ICON_SIZE.sm} />
            Reset to theme defaults
          </button>
        </div>
      )}
    </div>
  );
}
