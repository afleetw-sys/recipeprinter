import type { CSSProperties } from "react";

/**
 * The cook's text size: one multiplier on every recipe page's type, applied as
 * `--recipe-font-scale` on the page's `.recipe-print-preview` root (print.css
 * multiplies each `--recipe-card-*-size` / `-gap` by it where they are
 * defined). Covers, openers and the contents page never carry it.
 *
 * A fixed set, not a slider: every step is swept by the layout harness, so no
 * size a cook can pick has gone unmeasured.
 */
export const FONT_SCALES = [0.85, 0.92, 1, 1.1, 1.2] as const;

export type FontScale = (typeof FONT_SCALES)[number];

export const DEFAULT_FONT_SCALE: FontScale = 1;

/** What the cook sees. Never a percentage: "92%" means nothing at a glance. */
export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  0.85: "Smallest",
  0.92: "Smaller",
  1: "Normal",
  1.1: "Bigger",
  1.2: "Biggest",
};

/** Anything that isn't one of the steps (a missing field, an old save, a
    hand-edited hand-off) reads as Normal. */
export function normalizeFontScale(value: unknown): FontScale {
  return (FONT_SCALES as readonly unknown[]).includes(value) ? (value as FontScale) : DEFAULT_FONT_SCALE;
}

/** The style a recipe page's `.recipe-print-preview` root carries. Nothing at
    Normal, so a default card's markup is unchanged. */
export function fontScaleVars(scale: FontScale | undefined): CSSProperties | undefined {
  if (!scale || scale === DEFAULT_FONT_SCALE) return undefined;
  return { "--recipe-font-scale": scale } as CSSProperties;
}
