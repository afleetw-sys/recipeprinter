import type { CSSProperties } from "react";
import type { RecipePrintTemplate } from "@/types/recipe";

/**
 * A theme's accent color, the cook's choice in Customize theme (Amelia,
 * 2026-11-04). print.css maps it onto each theme's own color roles (title,
 * labels, step badges, bullets, frames and the art that is one color); see
 * "The cook's accent" there.
 *
 * Each theme offers its own few colors, in its own style: vintage inks for
 * Heirloom and Typewriter, retro brights for Counter and Diner, produce
 * colors for Market. A short list, not a color picker, and every one checked
 * against its theme's paper: 4.5:1 or better where it sets small text, and
 * for the bright themes about as much as their own color has (Bistro's coral
 * is 3.8:1, Counter's badges 2.5:1, Diner's outlined title 3.4:1), so their
 * choices are as bright as they are.
 *
 * Names are plain (Red, Blue, Green): each theme's Blue is its own shade, but
 * a cook choosing one wants the color, not a paint-chip name for it.
 *
 * Poster takes no accent: its color is its band, ten pop colors that take
 * turns by recipe, and the choice there is that band (`POSTER_COLORS`).
 * Garden, Quilt, Christmas, Fall and Halloween take nothing: their art
 * (Garden's tomatoes and hills, Quilt's two-color tiles) is in fixed colors.
 */
export interface AccentOption {
  id: string;
  label: string;
  hex: string;
}

export const THEME_PALETTES: Partial<Record<RecipePrintTemplate, readonly AccentOption[]>> = {
  classic: [
    { id: "navy", label: "Blue", hex: "#2b4a7c" },
    { id: "forest", label: "Green", hex: "#2f6b4f" },
    { id: "burgundy", label: "Red", hex: "#8a2c3b" },
    { id: "teal", label: "Teal", hex: "#1f6f78" },
    { id: "slate", label: "Gray", hex: "#4a5563" },
    { id: "plum", label: "Purple", hex: "#5d3f73" },
  ],
  heirloom: [
    { id: "oxblood", label: "Red", hex: "#7d1f26" },
    { id: "bottle", label: "Green", hex: "#2f5a3c" },
    { id: "ink", label: "Blue", hex: "#2c3e66" },
    { id: "tobacco", label: "Brown", hex: "#7a4a22" },
    { id: "plum", label: "Purple", hex: "#5a2e4f" },
  ],
  // Brights, as bright as Bistro's own coral against its blue checks.
  bistro: [
    { id: "raspberry", label: "Pink", hex: "#d6336c" },
    { id: "orange", label: "Orange", hex: "#e2611a" },
    { id: "kelly", label: "Green", hex: "#2c9a55" },
    { id: "teal", label: "Teal", hex: "#14958c" },
    { id: "grape", label: "Purple", hex: "#8e44c9" },
  ],
  pantry: [
    { id: "slate", label: "Blue", hex: "#4b5d73" },
    { id: "sage", label: "Green", hex: "#55684f" },
    { id: "clay", label: "Brown", hex: "#9a4f36" },
    { id: "plum", label: "Purple", hex: "#5f4562" },
    { id: "ink", label: "Gray", hex: "#2f3a4a" },
  ],
  counter: [
    { id: "tomato", label: "Red", hex: "#d9534f" },
    { id: "teal", label: "Teal", hex: "#2f8f86" },
    { id: "mustard", label: "Gold", hex: "#b97e14" },
    { id: "cobalt", label: "Blue", hex: "#4a74c9" },
    { id: "pink", label: "Pink", hex: "#d4607f" },
  ],
  keepsake: [
    { id: "sepia", label: "Brown", hex: "#6e4a2f" },
    { id: "rosewood", label: "Red", hex: "#7f3a3f" },
    { id: "olive", label: "Olive", hex: "#5c5a2e" },
    { id: "navy", label: "Blue", hex: "#3c4d6b" },
    { id: "moss", label: "Green", hex: "#4d5e3a" },
  ],
  typewriter: [
    { id: "ink", label: "Blue", hex: "#233a6b" },
    { id: "ribbon", label: "Red", hex: "#a32a2a" },
    { id: "green", label: "Green", hex: "#2f5a3a" },
    { id: "sepia", label: "Brown", hex: "#5e4630" },
    { id: "violet", label: "Purple", hex: "#4b3a78" },
  ],
  document: [
    { id: "navy", label: "Blue", hex: "#2f4a7a" },
    { id: "teal", label: "Teal", hex: "#1f6f6b" },
    { id: "forest", label: "Green", hex: "#3e6b3a" },
    { id: "brick", label: "Red", hex: "#9c3b25" },
    { id: "berry", label: "Pink", hex: "#8e2a52" },
    { id: "plum", label: "Purple", hex: "#5e3a78" },
  ],
  market: [
    { id: "tomato", label: "Red", hex: "#b5402c" },
    { id: "eggplant", label: "Purple", hex: "#5e3a6b" },
    { id: "leaf", label: "Green", hex: "#3a6e35" },
    { id: "carrot", label: "Orange", hex: "#a14a12" },
    { id: "blueberry", label: "Blue", hex: "#34518a" },
  ],
  supper: [
    { id: "bottle", label: "Green", hex: "#2e5940" },
    { id: "navy", label: "Blue", hex: "#2c3f63" },
    { id: "chocolate", label: "Brown", hex: "#5a3626" },
    { id: "plum", label: "Purple", hex: "#5a2e4c" },
    { id: "rust", label: "Orange", hex: "#8a3b17" },
  ],
  diner: [
    { id: "pink", label: "Pink", hex: "#e23e7a" },
    { id: "cobalt", label: "Blue", hex: "#2f6fd6" },
    { id: "teal", label: "Teal", hex: "#1a9a90" },
    { id: "orange", label: "Orange", hex: "#d85a12" },
    // Lighter than the other themes' purples: Diner's title is outlined in
    // black, so its fill has to stand off black as well as the paper (the
    // dark one, 3.6:1 against the outline, ran into it).
    { id: "grape", label: "Purple", hex: "#9b5de5" },
  ],
};

export type AccentColor = string;

export function themeTakesAccent(template: RecipePrintTemplate): boolean {
  return Boolean(THEME_PALETTES[template]);
}

/** Each theme's own color, the one a pick replaces, for the Default swatch
    that puts it back: its accent, or for Diner and Counter (dark labels, the color in
    their second accent) that second one. Read from the theme blocks in
    print.css; a theme's color changing there should change here. */
export const THEME_ACCENTS: Record<RecipePrintTemplate, string> = {
  classic: "#3f6094",
  heirloom: "#9c262f",
  bistro: "#d55c49",
  pantry: "#596873",
  counter: "#e8845b",
  keepsake: "#6e352b",
  typewriter: "#45413b",
  document: "#111111",
  garden: "#5f6b45",
  quilt: "#8c370d",
  market: "#498988",
  supper: "#7a151b",
  diner: "#db3937",
  poster: "#1f1f1f",
  christmas: "#c92e31",
  fall: "#91583b",
  halloween: "#b0501c",
};

function accentOption(template: RecipePrintTemplate, accent: unknown): AccentOption | undefined {
  return THEME_PALETTES[template]?.find((option) => option.id === accent);
}

/** A stored accent, kept only if it is one of this theme's own. */
export function normalizeAccent(value: unknown, template: RecipePrintTemplate): AccentColor | null {
  return accentOption(template, value)?.id ?? null;
}

/**
 * Poster's band colors, in the order recipes take them (print.css,
 * `[data-poster-color]`; keep in step). A cook can keep them taking turns or
 * give every recipe one of them.
 */
export const POSTER_COLORS: readonly AccentOption[] = [
  { id: "0", label: "Lime", hex: "#bbf55b" },
  { id: "1", label: "Lavender", hex: "#b5aacb" },
  { id: "2", label: "Teal", hex: "#64a9a4" },
  { id: "3", label: "Orange", hex: "#eca360" },
  { id: "4", label: "Blue", hex: "#749dcf" },
  { id: "5", label: "Yellow", hex: "#f0e999" },
  { id: "6", label: "Pink", hex: "#ac5280" },
  { id: "7", label: "Light blue", hex: "#bfd3e9" },
  { id: "8", label: "Brown", hex: "#ac7a63" },
  { id: "9", label: "Green", hex: "#87c39c" },
];

export function normalizePosterColor(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < POSTER_COLORS.length
    ? value
    : null;
}

/** Supper's utensils, which take turns by recipe unless the cook picks one. */
export const SUPPER_UTENSILS = ["fork", "spoon", "knife"] as const;
export type SupperUtensil = (typeof SUPPER_UTENSILS)[number];

export function normalizeUtensil(value: unknown): SupperUtensil | null {
  return (SUPPER_UTENSILS as readonly unknown[]).includes(value) ? (value as SupperUtensil) : null;
}

/** On a page root: the class print.css keys the override on, and the color.
    Nothing for the theme's own, so an untouched page's markup is unchanged. */
export function accentRootProps(
  accent: AccentColor | null | undefined,
  template: RecipePrintTemplate,
): {
  className: string;
  style: CSSProperties | undefined;
} {
  const color = accentOption(template, accent);
  if (!color) return { className: "", style: undefined };
  return {
    className: "recipe-accent-custom",
    style: { "--recipe-accent-custom": color.hex } as CSSProperties,
  };
}
