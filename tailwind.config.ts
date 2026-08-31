import type { Config } from "tailwindcss";

// RecipePrinter mirrors CookPilot's real design system so the two read as siblings.
// Source of truth: the :root tokens in app/globals.css.
//
// These colours used to be literal hex, duplicating the tokens rather than
// reading them, so `bg-card` and `var(--cp-card)` were two independent copies
// of white and only one of them could ever be re-skinned. Every colour below
// now resolves through its token, which is what lets a `data-ui-theme` on
// <html> move the whole UI at once (see the UI THEMES section in globals.css).
//
// `token()` exists so Tailwind's slash-opacity syntax keeps working: with a
// bare `var(--x)` string, `bg-ink/30` silently drops the /30. Tailwind hands
// the function the requested alpha, and color-mix applies it to whatever the
// variable currently resolves to — including tokens like --cp-line that
// already carry alpha of their own, which multiply correctly.
//
// The cast is Tailwind's own type gap, not a workaround for a hack: the
// function-per-colour form is documented and supported at runtime, but
// `Config["theme"]["colors"]` types every leaf as `string`.
const token = (name: string) =>
  (({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `var(${name})`
      : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand + neutrals, each reading its token (see :root in globals.css).
        ink: {
          DEFAULT: token("--cp-ink"),
          soft: token("--cp-ink-soft"),
        },
        brand: {
          // The accent used for decorative surfaces only (borders, fills,
          // rings, accent bars) — in the default theme it's a vivid teal that
          // fails text contrast on white (1.95:1). For accent-coloured *text*
          // use `brand.ink`, the darkened sibling every theme keeps AA-safe.
          DEFAULT: token("--cp-accent"),
          ink: token("--cp-accent-ink"),
          // Two tints of the accent, mixed against the card so they follow the
          // theme's paper as well as its accent. Were #eef9f8 / #d6f0ee.
          50: "color-mix(in srgb, var(--cp-accent) 8%, var(--cp-card))",
          100: "color-mix(in srgb, var(--cp-accent) 18%, var(--cp-card))",
        },
        teal: {
          // Alias of the brand accent (kept for existing references).
          DEFAULT: token("--cp-accent"),
          50: "color-mix(in srgb, var(--cp-accent) 7%, var(--cp-card))",
        },
        page: token("--cp-page"),
        card: token("--cp-card"),
        error: token("--cp-error"),
        // Hairline borders (--cp-line / --cp-line-strong)
        line: token("--cp-line"),
        "line-strong": token("--cp-line-strong"),
      },
      fontFamily: {
        // The UI face, via --rp-ui-font so a theme can swap it (it defaults to
        // Manrope, matching CookPilot). The fallbacks live inside the token,
        // because a mono theme wants a mono fallback, not system-ui.
        sans: ["var(--rp-ui-font)"],
        // Reserved for printed recipe titles (cookbook identity). Not themed:
        // printed artwork keeps its template's typography.
        serif: ["var(--font-playfair)", "Georgia", "serif"],
      },
      fontSize: {
        // One shared type scale (see --cp-fs-* in globals.css :root) so
        // titles, buttons, and body copy stay consistent across the site
        // instead of every component picking its own nearby rem value.
        "cp-label": "var(--cp-fs-label)",
        "cp-caption": "var(--cp-fs-caption)",
        "cp-small": "var(--cp-fs-small)",
        "cp-body": "var(--cp-fs-body)",
        "cp-body-lg": "var(--cp-fs-body-lg)",
        "cp-h2": "var(--cp-fs-h2)",
        "cp-dialog-title": "var(--cp-fs-dialog-title)",
        "cp-h2-lg": "var(--cp-fs-h2-lg)",
        "cp-hero-sm": "var(--cp-fs-hero-sm)",
        "cp-hero": "var(--cp-fs-hero)",
        "cp-hero-lg": "var(--cp-fs-hero-lg)",
      },
      borderRadius: {
        // Radius scale (default theme: sm 10 / md 14 / lg 18 / xl 24 / 2xl 28,
        // controls 12), read from --cp-radius-* so a theme moves the whole
        // family — a square 1990s skin and a rounded mid-century one are the
        // same UI with a different corner. `full` stays literal: a pill is a
        // pill in every era.
        none: "0",
        sm: "var(--cp-radius-sm)",
        DEFAULT: "var(--cp-radius-control)",
        md: "var(--cp-radius-md)",
        lg: "var(--cp-radius-lg)",
        xl: "var(--cp-radius-xl)",
        "2xl": "var(--cp-radius-2xl)",
        full: "9999px",
      },
      spacing: {
        // CookPilot --cp-space scale (4 / 8 / 12 / 16 / 20 / 24 / 32)
        "cp-1": "4px",
        "cp-2": "8px",
        "cp-3": "12px",
        "cp-4": "16px",
        "cp-5": "20px",
        "cp-6": "24px",
        "cp-7": "32px",
      },
      maxWidth: {
        panel: "560px",
        queue: "860px",
        recipe: "720px",
        content: "1240px",
      },
      boxShadow: {
        // Exposes the --cp-shadow-* elevation scale (globals.css :root) as
        // utilities so JSX reaches for shadow-cp-* instead of Tailwind's default
        // shadow-sm, whose thinner/cooler tint reads as a different depth system.
        "cp-xs": "var(--cp-shadow-xs)",
        "cp-sm": "var(--cp-shadow-sm)",
        "cp-md": "var(--cp-shadow-md)",
        "cp-lg": "var(--cp-shadow-lg)",
        "cp-xl": "var(--cp-shadow-xl)",
        "cp-sheet": "var(--cp-shadow-sheet)",
        "cp-selected": "var(--cp-selected-ring)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 220ms ease",
      },
    },
  },
  plugins: [],
};

export default config;
