import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm cream — CookPilot's page background
        cream: {
          DEFAULT: "#EDEAE5",
          50:  "#FAF9F7",
          100: "#F4F2EE",
          200: "#EDEAE5",
          300: "#E2DDD7",
          400: "#CEC8C0",
          500: "#B0A99F",
          600: "#8C857A",
          700: "#6B6460",
          800: "#4A4440",
          900: "#2E2926",
        },
        // Dark charcoal — CookPilot's primary action color
        charcoal: {
          DEFAULT: "#1A1D2E",
          50:  "#F2F3F6",
          100: "#E0E2EA",
          200: "#B8BDD0",
          300: "#8A91B0",
          400: "#5D6490",
          500: "#3D4570",
          600: "#2C3358",
          700: "#1A1D2E",
          800: "#111424",
          900: "#080A14",
        },
        // Teal — CookPilot brand accent (logo, badges, highlights)
        teal: {
          DEFAULT: "#2ABFC8",
          50:  "#F0FBFC",
          100: "#D6F4F6",
          200: "#A8E8EC",
          300: "#6DD8DE",
          400: "#2ABFC8",
          500: "#1EA3AB",
          600: "#168590",
          700: "#106470",
          800: "#0B4A54",
          900: "#073038",
        },
        // Semantic aliases
        bg:      "#EDEAE5",
        surface: "#FFFFFF",
      },
      fontFamily: {
        // CookPilot uses Inter throughout; RecipePrinter matches for UI,
        // and adds a serif for the printed recipe title (publishing identity)
        sans:  ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
      },
      borderRadius: {
        none:    "0",
        sm:      "4px",
        DEFAULT: "8px",   // buttons, inputs
        md:      "8px",
        lg:      "12px",  // cards — matches CookPilot recipe cards
        xl:      "16px",
        full:    "9999px", // pills/tags
      },
      boxShadow: {
        // Matches CookPilot's very subtle card shadow
        card:     "0 1px 4px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-md": "0 4px 16px 0 rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.05)",
      },
      fontSize: {
        // Mirrors CookPilot's scale
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
        xs:    ["0.75rem",  { lineHeight: "1rem" }],
        sm:    ["0.875rem", { lineHeight: "1.25rem" }],
        base:  ["1rem",     { lineHeight: "1.5rem" }],
        lg:    ["1.125rem", { lineHeight: "1.75rem" }],
        xl:    ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem",   { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem",  { lineHeight: "2.5rem" }],
        "5xl": ["3rem",     { lineHeight: "1.1" }],
      },
      maxWidth: {
        recipe:  "720px",
        landing: "480px",
        content: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
