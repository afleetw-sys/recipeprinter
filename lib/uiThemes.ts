// UI THEMES — experimental
//
// The catalogue behind the theme switcher. Each entry is only a *label* for a
// block of CSS variables: the actual skin lives in the UI THEMES section of
// app/globals.css, keyed by `data-ui-theme` on <html>. Nothing here is read at
// render time by the app itself, only by the picker that shows the options.
//
// The swatches are documentation, not the source of the theme. They're the
// palette a theme was built from, so the picker can show what you're choosing
// before you choose it; a couple of them are deliberately a shade off what the
// CSS ships (Thermal Roll's khaki, for instance, is darkened in the CSS to
// clear AA as body text) and the CSS is the one that's right.

export const UI_THEME_STORAGE_KEY = "rp:ui-theme";

/** Overrides the stored choice for one page load, for sharing a look. */
export const UI_THEME_QUERY_PARAM = "ui-theme";

export type UiThemeSwatch = {
  name: string;
  hex: string;
};

export type UiTheme = {
  /** Matches the `[data-ui-theme="…"]` selector in globals.css. `null` is the
      shipping design system, which has no attribute at all. */
  id: string | null;
  name: string;
  /** The era this is reaching for, shown as the badge on the picker card. */
  era: string;
  description: string;
  swatches: UiThemeSwatch[];
};

export const UI_THEMES: UiTheme[] = [
  {
    id: null,
    name: "RecipePrinter",
    era: "Today",
    description: "The shipping design system: white paper, soft blue-grey ground, brand teal",
    swatches: [
      { name: "White", hex: "#ffffff" },
      { name: "Ink", hex: "#111111" },
      { name: "Teal", hex: "#60cac4" },
      { name: "Teal Ink", hex: "#2f7d78" },
      { name: "Page", hex: "#f5f7fb" },
    ],
  },
  {
    id: "atomic-age",
    name: "Atomic Age",
    era: "1950s–60s",
    description: "Ivory modernism with deep navy, atomic red, and bright mustard",
    swatches: [
      { name: "Ivory", hex: "#f4f0e6" },
      { name: "Navy", hex: "#1a4e78" },
      { name: "Mustard", hex: "#f0c030" },
      { name: "Atomic Red", hex: "#c83838" },
      { name: "Charcoal", hex: "#383838" },
    ],
  },
  {
    id: "thermal-roll",
    name: "Thermal Roll",
    era: "Early web",
    description: "Slightly yellowed thermal paper, slate ink, with warm amber and steel teal",
    swatches: [
      { name: "Thermal", hex: "#f5f4ee" },
      { name: "Slate", hex: "#202830" },
      { name: "Amber", hex: "#b87840" },
      { name: "Steel Teal", hex: "#407888" },
      { name: "Khaki", hex: "#6a7060" },
    ],
  },
  {
    id: "sunroom",
    name: "Sunroom",
    era: "Your pick",
    description: "Pale mint ground with clay warming one side, cornflower cooling the other",
    swatches: [
      { name: "Pale Mint", hex: "#f4f7f3" },
      { name: "Slate", hex: "#22303a" },
      { name: "Clay", hex: "#c96a4c" },
      { name: "Cornflower", hex: "#4a6fa8" },
      { name: "Stone", hex: "#5f6f79" },
    ],
  },
];

const VALID_IDS = new Set(UI_THEMES.map((t) => t.id).filter(Boolean) as string[]);

/** Narrows an unknown string (query param, localStorage) to a real theme id.
    Anything unrecognised falls back to the shipping design system. */
export function normalizeUiThemeId(value: string | null | undefined): string | null {
  if (!value) return null;
  return VALID_IDS.has(value) ? value : null;
}

/** The single place that knows how a theme is applied, so the pre-paint script
    in the root layout and the picker can't drift apart. Kept as a string so the
    layout can inline it verbatim into a <script> that runs before first paint —
    setting the attribute from a React effect instead would repaint the whole UI
    in the default theme first, which is exactly the flash themes are notorious
    for. */
export const APPLY_UI_THEME_SOURCE = `
(function () {
  try {
    var q = new URLSearchParams(location.search).get(${JSON.stringify(UI_THEME_QUERY_PARAM)});
    var id = q !== null ? q : localStorage.getItem(${JSON.stringify(UI_THEME_STORAGE_KEY)});
    if (id) document.documentElement.setAttribute("data-ui-theme", id);
  } catch (e) {}
})();
`.trim();

/** Reads what the pre-paint script above already decided, rather than
    re-deriving it — one source of truth for "which theme is on right now". */
export function readAppliedUiThemeId(): string | null {
  if (typeof document === "undefined") return null;
  return normalizeUiThemeId(document.documentElement.getAttribute("data-ui-theme"));
}

export function applyUiTheme(id: string | null) {
  const root = document.documentElement;
  if (id) root.setAttribute("data-ui-theme", id);
  else root.removeAttribute("data-ui-theme");
  try {
    if (id) localStorage.setItem(UI_THEME_STORAGE_KEY, id);
    else localStorage.removeItem(UI_THEME_STORAGE_KEY);
  } catch {
    // Private browsing and blocked storage: the theme still applies for this
    // page, it just won't be remembered. Not worth telling anyone about.
  }
}
