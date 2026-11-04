import type { CSSProperties } from "react";
import type { RecipePrintTemplate } from "@/types/recipe";

/**
 * A theme's accent color, the cook's choice in Customize theme (Amelia,
 * 2026-11-04). The accent is what each theme sets its labels, section titles,
 * step numbers and rules in (`--recipe-accent` in print.css); its art and its
 * second, decorative color stay the theme's.
 *
 * A short list, not a color picker: every one is dark enough to read as text
 * on every theme's light paper (4.5:1 or better on white), so no choice can
 * make a recipe hard to read.
 */
export const ACCENT_COLORS = [
  { id: "navy", label: "Navy", hex: "#2f4a7a" },
  { id: "teal", label: "Teal", hex: "#1f6f6b" },
  { id: "forest", label: "Forest", hex: "#3e6b3a" },
  { id: "brick", label: "Brick", hex: "#9c3b25" },
  { id: "berry", label: "Berry", hex: "#8e2a52" },
  { id: "plum", label: "Plum", hex: "#5e3a78" },
  { id: "charcoal", label: "Charcoal", hex: "#333333" },
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number]["id"];

/** Themes whose art is in fixed colors: a new accent would fight it, so
    they don't offer one (print.css has no accent rules for them). */
const FIXED_COLOR_THEMES: ReadonlySet<RecipePrintTemplate> = new Set<RecipePrintTemplate>(["christmas", "fall", "halloween"]);

export function themeTakesAccent(template: RecipePrintTemplate): boolean {
  return !FIXED_COLOR_THEMES.has(template);
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

export function normalizeAccent(value: unknown): AccentColor | null {
  return ACCENT_COLORS.some((color) => color.id === value) ? (value as AccentColor) : null;
}

/** On a page root: the class print.css keys the override on, and the color.
    Nothing for the theme's own, so an untouched page's markup is unchanged. */
export function accentRootProps(accent: AccentColor | null | undefined): {
  className: string;
  style: CSSProperties | undefined;
} {
  const color = accent ? ACCENT_COLORS.find((candidate) => candidate.id === accent) : undefined;
  if (!color) return { className: "", style: undefined };
  return {
    className: "recipe-accent-custom",
    style: { "--recipe-accent-custom": color.hex } as CSSProperties,
  };
}
