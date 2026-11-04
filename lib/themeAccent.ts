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
 * against its theme's paper: 4.5:1 or better where it sets small text, 3:1
 * where it only fills Counter's badges or Diner's big outlined title (their
 * own colors sit at 2.5:1 and 3.4:1).
 *
 * Poster takes no accent: its color is its band, ten pop colors that take
 * turns by recipe, and the choice there is that band (`POSTER_COLORS`).
 * Christmas, Fall and Halloween take nothing: their art is in fixed colors.
 */
export interface AccentOption {
  id: string;
  label: string;
  hex: string;
}

export const THEME_PALETTES: Partial<Record<RecipePrintTemplate, readonly AccentOption[]>> = {
  classic: [
    { id: "navy", label: "Navy", hex: "#2b4a7c" },
    { id: "forest", label: "Forest", hex: "#2f6b4f" },
    { id: "burgundy", label: "Burgundy", hex: "#8a2c3b" },
    { id: "teal", label: "Teal", hex: "#1f6f78" },
    { id: "slate", label: "Slate", hex: "#4a5563" },
    { id: "plum", label: "Plum", hex: "#5d3f73" },
  ],
  heirloom: [
    { id: "oxblood", label: "Oxblood", hex: "#7d1f26" },
    { id: "bottle", label: "Bottle green", hex: "#2f5a3c" },
    { id: "ink", label: "Ink blue", hex: "#2c3e66" },
    { id: "tobacco", label: "Tobacco", hex: "#7a4a22" },
    { id: "plum", label: "Plum", hex: "#5a2e4f" },
  ],
  bistro: [
    { id: "tomato", label: "Tomato", hex: "#b83f2a" },
    { id: "bordeaux", label: "Bordeaux", hex: "#8c2333" },
    { id: "rust", label: "Rust", hex: "#9a4a1c" },
    { id: "olive", label: "Olive", hex: "#5f6b2a" },
    { id: "ink", label: "Ink", hex: "#2a3550" },
  ],
  pantry: [
    { id: "slate", label: "Slate blue", hex: "#4b5d73" },
    { id: "sage", label: "Sage", hex: "#55684f" },
    { id: "clay", label: "Clay", hex: "#9a4f36" },
    { id: "plum", label: "Plum", hex: "#5f4562" },
    { id: "ink", label: "Ink", hex: "#2f3a4a" },
  ],
  counter: [
    { id: "tomato", label: "Tomato", hex: "#d9534f" },
    { id: "teal", label: "Teal", hex: "#2f8f86" },
    { id: "mustard", label: "Mustard", hex: "#b97e14" },
    { id: "cobalt", label: "Cobalt", hex: "#4a74c9" },
    { id: "pink", label: "Pink", hex: "#d4607f" },
  ],
  keepsake: [
    { id: "sepia", label: "Sepia", hex: "#6e4a2f" },
    { id: "rosewood", label: "Rosewood", hex: "#7f3a3f" },
    { id: "olive", label: "Olive", hex: "#5c5a2e" },
    { id: "navy", label: "Faded navy", hex: "#3c4d6b" },
    { id: "moss", label: "Moss", hex: "#4d5e3a" },
  ],
  typewriter: [
    { id: "ink", label: "Ink blue", hex: "#233a6b" },
    { id: "ribbon", label: "Ribbon red", hex: "#a32a2a" },
    { id: "green", label: "Green ink", hex: "#2f5a3a" },
    { id: "sepia", label: "Sepia", hex: "#5e4630" },
    { id: "violet", label: "Violet ink", hex: "#4b3a78" },
  ],
  document: [
    { id: "navy", label: "Navy", hex: "#2f4a7a" },
    { id: "teal", label: "Teal", hex: "#1f6f6b" },
    { id: "forest", label: "Forest", hex: "#3e6b3a" },
    { id: "brick", label: "Brick", hex: "#9c3b25" },
    { id: "berry", label: "Berry", hex: "#8e2a52" },
    { id: "plum", label: "Plum", hex: "#5e3a78" },
  ],
  garden: [
    { id: "moss", label: "Moss", hex: "#4a6b3a" },
    { id: "fern", label: "Fern", hex: "#3f6b4a" },
    { id: "sage", label: "Sage", hex: "#56684f" },
    { id: "eggplant", label: "Eggplant", hex: "#5a3d5c" },
    { id: "slate", label: "Slate", hex: "#4a5a66" },
  ],
  quilt: [
    { id: "barn", label: "Barn red", hex: "#9a2e25" },
    { id: "indigo", label: "Indigo", hex: "#33457a" },
    { id: "mustard", label: "Mustard", hex: "#80600f" },
    { id: "plum", label: "Plum", hex: "#6a3355" },
    { id: "teal", label: "Teal", hex: "#2a6466" },
  ],
  market: [
    { id: "tomato", label: "Tomato", hex: "#b5402c" },
    { id: "eggplant", label: "Eggplant", hex: "#5e3a6b" },
    { id: "leaf", label: "Leaf", hex: "#3a6e35" },
    { id: "carrot", label: "Carrot", hex: "#a14a12" },
    { id: "blueberry", label: "Blueberry", hex: "#34518a" },
  ],
  supper: [
    { id: "bottle", label: "Bottle green", hex: "#2e5940" },
    { id: "navy", label: "Navy", hex: "#2c3f63" },
    { id: "chocolate", label: "Chocolate", hex: "#5a3626" },
    { id: "plum", label: "Plum", hex: "#5a2e4c" },
    { id: "rust", label: "Rust", hex: "#8a3b17" },
  ],
  diner: [
    { id: "pink", label: "Hot pink", hex: "#e23e7a" },
    { id: "cobalt", label: "Cobalt", hex: "#2f6fd6" },
    { id: "teal", label: "Teal", hex: "#1a9a90" },
    { id: "orange", label: "Orange", hex: "#d85a12" },
    { id: "grape", label: "Grape", hex: "#7a4cc2" },
  ],
};

export type AccentColor = string;

export function themeTakesAccent(template: RecipePrintTemplate): boolean {
  return Boolean(THEME_PALETTES[template]);
}

/** Each theme's own color, the one a pick replaces, for the swatch that puts
    it back: its accent, or for Diner and Counter (dark labels, the color in
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
  { id: "2", label: "Sea green", hex: "#64a9a4" },
  { id: "3", label: "Apricot", hex: "#eca360" },
  { id: "4", label: "Cornflower", hex: "#749dcf" },
  { id: "5", label: "Butter", hex: "#f0e999" },
  { id: "6", label: "Magenta", hex: "#ac5280" },
  { id: "7", label: "Sky", hex: "#bfd3e9" },
  { id: "8", label: "Clay", hex: "#ac7a63" },
  { id: "9", label: "Mint", hex: "#87c39c" },
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
