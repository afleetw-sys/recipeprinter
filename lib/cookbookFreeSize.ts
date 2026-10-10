import { FREE_COOKBOOK_RECIPES, IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";

/**
 * A cookbook's free preview size (docs/import-meter-plan.md, 3.2).
 *
 * An unbought book can hold up to `FREE_COOKBOOK_RECIPES` recipes, from any
 * source. Buying that book lifts the cap; Pro doesn't, and a card project
 * never has one. It counts recipes IN the book, so the number is the one the
 * rail shows and deleting a recipe frees a space.
 *
 * A book that already holds more than the cap (an older book) keeps every
 * recipe: only adding more is gated. Checked in the browser only, like the
 * rest of the cookbook lock; exporting stays server-checked.
 */

/**
 * How many more recipes this project can take, or null when nothing caps it.
 * `locked` is the cookbook's own "not bought" state; while that is still
 * loading the book isn't capped, so a slow purchase check never blocks an add.
 */
export function bookRoomLeft(input: {
  cookbookMode: boolean;
  locked: boolean;
  recipeCount: number;
  live?: boolean;
  cap?: number;
}): number | null {
  if (!(input.live ?? IMPORT_ALLOWANCE_LIVE)) return null;
  if (!input.cookbookMode || !input.locked) return null;
  return Math.max(0, (input.cap ?? FREE_COOKBOOK_RECIPES) - input.recipeCount);
}

/** The recipes that fit, in order. With no cap, all of them. */
export function fitBookRoom<T>(incoming: T[], room: number | null): T[] {
  return room === null ? incoming : incoming.slice(0, room);
}
