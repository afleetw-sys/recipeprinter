import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — deep forest green (food-adjacent, premium)
        forest: {
          50:  "#f2f7f2",
          100: "#e0ece0",
          200: "#c2d9c3",
          300: "#96bc98",
          400: "#659768",
          500: "#437a46",
          600: "#316035",
          700: "#284d2c",
          800: "#213e25",
          900: "#1c341f",
          950: "#0e1d11",
        },
        // Accent — warm terracotta
        terra: {
          50:  "#fdf5f0",
          100: "#fae6db",
          200: "#f5cab5",
          300: "#eda685",
          400: "#e37a52",
          500: "#c8502a",
          600: "#b03d1f",
          700: "#922f1a",
          800: "#78281a",
          900: "#63231a",
        },
        // Neutral warm grays
        parchment: {
          50:  "#fafaf7",
          100: "#f4f4ef",
          200: "#e8e8e0",
          300: "#d5d5ca",
          400: "#b0b0a3",
          500: "#8a8a7c",
          600: "#6e6e61",
          700: "#5a5a4e",
          800: "#4a4a3f",
          900: "#3d3d33",
          950: "#1e1e17",
        },
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans:  ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "recipe-title": ["2.5rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],
        "recipe-section": ["0.6875rem", { lineHeight: "1", letterSpacing: "0.12em", fontWeight: "600" }],
      },
      maxWidth: {
        "recipe": "680px",
        "landing": "520px",
      },
      borderRadius: {
        DEFAULT: "8px",
        "lg": "12px",
        "xl": "16px",
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
