"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CoverConfig } from "@/types/recipe";

/**
 * How loudly a cookbook wears its theme (`ProjectMeta.quietTheme`).
 *
 * A quiet book (every book made from 2026-11-23 on):
 *   - recipe pages carry only the theme's edge, softened: no illustrations
 *     (Garden's hills, Fall's pumpkins, Christmas's hats), no Supper utensil,
 *     and the frames, bands and strips that remain printed light;
 *   - chapter openers carry the theme's full art, so the theme shows where a
 *     chapter starts;
 *   - the front cover's photo defaults to a picture under the title, on the
 *     theme's designed page, rather than filling the page.
 *
 * A book made before keeps exactly the look it always had: art on every
 * recipe page, none on chapter openers, and its cover photo as the
 * background. Recipe cards are not a book and never read this.
 *
 * Around a whole page (the print page, the export) like ThemeArtProvider, so
 * every face, the rail and the measurers read the same answer. Unlike theme
 * art this does change layout (a quiet recipe page has no art to reserve room
 * for), which is why the measurers must sit inside it too.
 */
const QuietThemeContext = createContext(false);

export function QuietThemeProvider({ quiet, children }: { quiet: boolean; children: ReactNode }) {
  return <QuietThemeContext.Provider value={quiet}>{children}</QuietThemeContext.Provider>;
}

export function useQuietTheme(): boolean {
  return useContext(QuietThemeContext);
}

/** Where a front cover's photo goes: the cook's choice, else the book's default. */
export function coverPhotoPlacement(
  cover: Pick<CoverConfig, "photoPlacement">,
  quietTheme: boolean,
): "card" | "background" {
  return cover.photoPlacement ?? (quietTheme ? "card" : "background");
}
