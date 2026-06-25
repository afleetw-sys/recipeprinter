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
          // CookPilot's primary accent blue
          DEFAULT: "#009bfa",
          50: "#eaf6ff",
          100: "#cfeaff",
        },
        teal: {
          // CookPilot's secondary accent
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
      boxShadow: {
        // CookPilot's near-invisible card elevation
        card: "0 4px 10px rgba(23, 32, 56, 0.026), 0 1px 2px rgba(23, 32, 56, 0.018)",
        "card-hover": "0 18px 40px rgba(23, 32, 56, 0.10), 0 4px 12px rgba(23, 32, 56, 0.05)",
        ring: "0 0 0 4px rgba(0, 155, 250, 0.08)",
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
        content: "1100px",
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
