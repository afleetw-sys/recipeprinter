import type { Config } from "tailwindcss";

// RecipePrinter mirrors CookPilot's real design system so the two read as siblings.
// Source of truth: CookPilot web `src/app/globals.css` :root tokens.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CookPilot brand + neutrals (see :root in CookPilot globals.css)
        ink: {
          DEFAULT: "#111111",
          soft: "#667085",
        },
        brand: {
          // RecipePrinter accent. #60cac4 is the vivid brand teal, used for
          // decorative surfaces only (borders, fills, rings, accent bars) — it
          // fails text contrast on white (1.95:1). For accent-colored *text* use
          // `brand.ink`, a darkened sibling that clears WCAG AA (4.85:1).
          DEFAULT: "#60cac4",
          ink: "#2f7d78",
          50: "#eef9f8",
          100: "#d6f0ee",
        },
        teal: {
          // Alias of the brand accent (kept for existing references).
          DEFAULT: "#60cac4",
          50: "#eefaf9",
        },
        page: "#f5f7fb",
        card: "#ffffff",
        error: "#c53f3f",
        // Hairline borders (CookPilot --cp-line / --cp-line-strong)
        line: "rgba(17, 17, 17, 0.08)",
        "line-strong": "rgba(17, 17, 17, 0.14)",
      },
      fontFamily: {
        // CookPilot uses Manrope throughout the UI; RecipePrinter matches it.
        // A serif is reserved for printed recipe titles (cookbook identity).
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
      },
      borderRadius: {
        // CookPilot radius scale: sm 10 / md 14 / lg 18 / xl 24 / 2xl 28.
        // Controls (buttons, inputs, toggles) use 12px.
        none: "0",
        sm: "10px",
        DEFAULT: "12px",
        md: "14px",
        lg: "18px",
        xl: "24px",
        "2xl": "28px",
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
        content: "1180px",
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
