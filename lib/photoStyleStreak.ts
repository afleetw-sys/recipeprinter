import type { PhotoStyle } from "@/lib/project";

/**
 * Noticing a cook doing by hand what the book-wide Photos setting does in one
 * click.
 *
 * A cook went through 150 recipes setting each one's photo to "In page" from
 * its own toolbar, never having seen the "Every recipe" Photos control that
 * would have done the lot. So we count: the same layout picked on this many
 * DIFFERENT recipes in a row is someone working through the book, and worth a
 * tip pointing at the control. Picking a different layout starts the count
 * over; picking the same recipe twice does not advance it.
 */
export const PHOTO_STREAK_THRESHOLD = 5;

export interface PhotoStyleStreak {
  mode: PhotoStyle;
  recipeIds: string[];
}

export function recordPhotoChoice(
  streak: PhotoStyleStreak | null,
  recipeId: string,
  mode: PhotoStyle,
): PhotoStyleStreak {
  if (!streak || streak.mode !== mode) return { mode, recipeIds: [recipeId] };
  if (streak.recipeIds.includes(recipeId)) return streak;
  return { mode, recipeIds: [...streak.recipeIds, recipeId] };
}

/**
 * Whether to offer the book-wide control now. Only once the streak is long
 * enough AND there are recipes still to change: a book whose every recipe is
 * already in that layout has nothing left for the tip to save.
 */
export function shouldOfferBookPhotoStyle(streak: PhotoStyleStreak, remaining: number): boolean {
  return streak.recipeIds.length >= PHOTO_STREAK_THRESHOLD && remaining > 0;
}

const SEEN_KEY = "rp-photo-style-tip-seen";

/** Once per device: a tip that keeps coming back after it was answered is a nag. */
export function photoStyleTipSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPhotoStyleTipSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode or a full origin: the tip may come back next visit, which
    // is the lesser harm than not offering it at all.
  }
}
