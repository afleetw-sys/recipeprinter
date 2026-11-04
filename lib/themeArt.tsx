"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SupperUtensil } from "@/lib/themeAccent";

/**
 * The cook's choice for art that takes turns by recipe (lib/themeLooks.ts):
 * one Poster band color, or one Supper utensil, for every recipe. null: they
 * take turns, as each theme ships. Around a whole page (the print page, the
 * export) so every card face reads it without passing it down through the
 * deck, the rail and the measurers. It changes no layout, only which piece of
 * art is drawn.
 */
export interface ThemeArt {
  posterColor: number | null;
  utensil: SupperUtensil | null;
}

const ThemeArtContext = createContext<ThemeArt>({ posterColor: null, utensil: null });

export function ThemeArtProvider({ value, children }: { value: ThemeArt; children: ReactNode }) {
  return <ThemeArtContext.Provider value={value}>{children}</ThemeArtContext.Provider>;
}

export function useThemeArt(): ThemeArt {
  return useContext(ThemeArtContext);
}
