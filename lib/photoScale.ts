import type { CSSProperties } from "react";
import { DEFAULT_FONT_SCALE, type FontScale } from "@/lib/fontScale";

/**
 * The cook's photo size: one multiplier on the recipe photo's picture, applied
 * as `--recipe-photo-scale` on the page's `.recipe-print-preview` root, next to
 * `--recipe-font-scale`. Only the picture: a theme's mat or frame is its art
 * and keeps its size (see `--recipe-photo-mat` in print.css).
 *
 * Until 2026-11 the photo followed the text size at half its step, so these
 * are that range (Biggest text gave 1.1): every step has been through the
 * layout harness already.
 */
export const PHOTO_SCALES = [0.9, 1, 1.1] as const;

export type PhotoScale = (typeof PHOTO_SCALES)[number];

export const DEFAULT_PHOTO_SCALE: PhotoScale = 1;

export const PHOTO_SCALE_LABELS: Record<PhotoScale, string> = {
  0.9: "Smaller",
  1: "Normal",
  1.1: "Bigger",
};

export function normalizePhotoScale(value: unknown): PhotoScale {
  return (PHOTO_SCALES as readonly unknown[]).includes(value) ? (value as PhotoScale) : DEFAULT_PHOTO_SCALE;
}

/**
 * The photo size a page saved before photos had their own had: half the text
 * size's step, to the nearest step here. Bigger (1.05) rounds up, so a cook who
 * made everything bigger still has the bigger photo.
 */
export function legacyPhotoScale(fontScale: FontScale): PhotoScale {
  if (fontScale === DEFAULT_FONT_SCALE) return DEFAULT_PHOTO_SCALE;
  if (fontScale > DEFAULT_FONT_SCALE) return 1.1;
  return fontScale <= 0.85 ? 0.9 : DEFAULT_PHOTO_SCALE;
}

/** Nothing at Normal, so a default card's markup is unchanged. */
export function photoScaleVars(scale: PhotoScale | undefined): CSSProperties | undefined {
  if (!scale || scale === DEFAULT_PHOTO_SCALE) return undefined;
  return { "--recipe-photo-scale": scale } as CSSProperties;
}
