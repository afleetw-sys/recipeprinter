import { DEFAULT_FONT_SCALE, normalizeFontScale, type FontScale } from "@/lib/fontScale";
import { DEFAULT_PHOTO_SCALE, legacyPhotoScale, normalizePhotoScale, type PhotoScale } from "@/lib/photoScale";
import { RECIPE_PRINT_TEMPLATE_OPTIONS } from "@/lib/printTemplates";
import {
  normalizeAccent,
  normalizePosterColor,
  normalizeUtensil,
  type AccentColor,
  type SupperUtensil,
} from "@/lib/themeAccent";
import type { RecipePrintTemplate } from "@/types/recipe";

/**
 * What a cook has customized about one theme: its text size, photo size,
 * accent color, and for a theme whose art takes turns by recipe, one piece for
 * every recipe instead (Poster's band color, Supper's utensil).
 * Each theme keeps its own. Changing Bistro's text size leaves Garden's alone,
 * and switching back to Bistro brings Bistro's back, so trying themes never
 * costs a cook what they set up in one.
 *
 * Only how a theme LOOKS lives here. What the book holds and how it prints
 * (photos None / In page / Full page, the recipe link, size, cut lines) are
 * the book's, and stay put across a theme switch.
 */
export interface ThemeLook {
  fontScale?: FontScale;
  photoScale?: PhotoScale;
  /** Absent: the theme's own accent (lib/themeAccent.ts). */
  accent?: AccentColor;
  /** Poster: one band color for every recipe. Absent: they take turns. */
  posterColor?: number;
  /** Supper: one utensil for every recipe. Absent: they take turns. */
  utensil?: SupperUtensil;
}

export type ThemeLooks = Partial<Record<RecipePrintTemplate, ThemeLook>>;

export interface ResolvedThemeLook {
  fontScale: FontScale;
  photoScale: PhotoScale;
  /** null: the theme's own accent. */
  accent: AccentColor | null;
  /** null: taking turns. */
  posterColor: number | null;
  utensil: SupperUtensil | null;
}

export const DEFAULT_THEME_LOOK: ResolvedThemeLook = {
  fontScale: DEFAULT_FONT_SCALE,
  photoScale: DEFAULT_PHOTO_SCALE,
  accent: null,
  posterColor: null,
  utensil: null,
};

export function lookFor(looks: ThemeLooks, template: RecipePrintTemplate): ResolvedThemeLook {
  const look = looks[template];
  return {
    fontScale: look?.fontScale ?? DEFAULT_FONT_SCALE,
    photoScale: look?.photoScale ?? DEFAULT_PHOTO_SCALE,
    accent: look?.accent ?? null,
    posterColor: look?.posterColor ?? null,
    utensil: look?.utensil ?? null,
  };
}

/** Whether this theme differs from how it ships. Customizing a recipe card is
    Pro; this is what the lock reads. */
export function isCustomized(look: ResolvedThemeLook): boolean {
  return (
    look.fontScale !== DEFAULT_FONT_SCALE ||
    look.photoScale !== DEFAULT_PHOTO_SCALE ||
    look.accent !== null ||
    look.posterColor !== null ||
    look.utensil !== null
  );
}

/** `looks` with this theme's look changed. A theme back at every default is
    dropped, so an untouched theme stores nothing. */
export function withLook(
  looks: ThemeLooks,
  template: RecipePrintTemplate,
  change: Partial<ResolvedThemeLook>,
): ThemeLooks {
  const next = { ...lookFor(looks, template), ...change };
  const rest = { ...looks };
  delete rest[template];
  if (!isCustomized(next)) return rest;
  const look: ThemeLook = {};
  if (next.fontScale !== DEFAULT_FONT_SCALE) look.fontScale = next.fontScale;
  if (next.photoScale !== DEFAULT_PHOTO_SCALE) look.photoScale = next.photoScale;
  if (next.accent !== null) look.accent = next.accent;
  if (next.posterColor !== null) look.posterColor = next.posterColor;
  if (next.utensil !== null) look.utensil = next.utensil;
  return { ...rest, [template]: look };
}

/**
 * Stored looks, read defensively, with a save from before them carried over:
 * one text size for every theme, and a photo that followed it at half the
 * step. That becomes every theme's look, as it was, so a cook who needs the
 * biggest text still has it whichever theme they open or switch to.
 */
export function normalizeThemeLooks(stored: unknown, legacy: { fontScale?: unknown }): ThemeLooks {
  if (stored && typeof stored === "object") {
    let looks: ThemeLooks = {};
    for (const option of RECIPE_PRINT_TEMPLATE_OPTIONS) {
      const raw = (stored as Record<string, unknown>)[option.id];
      if (!raw || typeof raw !== "object") continue;
      const { fontScale, photoScale, accent, posterColor, utensil } = raw as Record<string, unknown>;
      looks = withLook(looks, option.id, {
        fontScale: normalizeFontScale(fontScale),
        photoScale: normalizePhotoScale(photoScale),
        accent: normalizeAccent(accent, option.id),
        posterColor: option.id === "poster" ? normalizePosterColor(posterColor) : null,
        utensil: option.id === "supper" ? normalizeUtensil(utensil) : null,
      });
    }
    return looks;
  }
  const fontScale = normalizeFontScale(legacy.fontScale);
  if (fontScale === DEFAULT_FONT_SCALE) return {};
  const look = { fontScale, photoScale: legacyPhotoScale(fontScale) };
  return RECIPE_PRINT_TEMPLATE_OPTIONS.reduce<ThemeLooks>((looks, option) => withLook(looks, option.id, look), {});
}

/**
 * Whether Customize theme offers the photo size. It sizes the photo in a
 * recipe page, so it's offered whenever the book has photos, whatever the
 * book-wide Photos choice is: a book on Full page, or on None with recipes
 * set in page one by one, still has photos to size, and the setting
 * shouldn't hide until the cook finds the one choice that shows it.
 */
export function photoSizeOffered({
  cookbookMode,
  cardPhotosAllowed,
  hasPhotos,
}: {
  cookbookMode: boolean;
  /** Recipe cards: photos are part of this account's cards at all. */
  cardPhotosAllowed: boolean;
  /** Any recipe in the project has a photo (or, in a book of the cook's own
      photos, a place for one). */
  hasPhotos: boolean;
}): boolean {
  return hasPhotos && (cookbookMode || cardPhotosAllowed);
}
