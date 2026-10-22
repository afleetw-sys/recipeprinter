import { uid } from "@/lib/ids";
import type { QueueItem } from "@/types/recipe";

/**
 * Pages of the book's own that sit among its recipes: today, a blank page.
 *
 * They are queue items so they live in a chapter's order with the recipes,
 * and so save, reorder, delete and export with them without a second list to
 * keep in step. What they are not is a recipe: no import made them, they do
 * not count toward a free preview's recipes, and a missing `recipe` on one is
 * not a parse still running.
 */
export function isBookPage(item: Pick<QueueItem, "pageKind"> | null | undefined): boolean {
  return Boolean(item?.pageKind);
}

/** A recipe, or one still on its way: anything in the book but its own pages. */
export function isRecipeEntry(item: Pick<QueueItem, "pageKind"> | null | undefined): boolean {
  return Boolean(item) && !isBookPage(item);
}

export function newBlankPage(): QueueItem {
  return {
    id: `page-${uid()}`,
    method: "manual",
    source: "",
    status: "ready",
    title: "Blank page",
    addedAt: Date.now(),
    pageKind: "blank",
  };
}
