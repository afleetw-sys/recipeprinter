import type { QueueItem } from "@/types/recipe";

/**
 * What a placeholder says while an import is in flight.
 *
 * The deck used to render `parsingImportCount` anonymous spinners, so there was
 * nothing to say: one spinner stood for "some number of recipes". Keyed to the
 * item, a placeholder can name what it is waiting for, which is the difference
 * between "something is happening" and "your allrecipes link is being read" —
 * and on a slow parse that is the difference between waiting and reloading.
 *
 * Falls back to the generic line rather than inventing one: `source` is a
 * hostname for URLs and a filename-ish label for photos, but it is free text
 * from the item's origin and can be empty.
 */
export function importLoadingLabel(item: Pick<QueueItem, "method" | "source">): string {
  const source = item.source?.trim();

  switch (item.method) {
    case "url":
      return source ? `Getting the recipe from ${source}…` : "Getting the recipe…";
    case "image":
      return source ? `Reading ${source}…` : "Reading your photo…";
    case "text":
      return "Reading your recipe…";
    case "cookpilot":
    case "paprika":
      return source ? `Getting ${source}…` : "Getting the recipe…";
    default:
      return "Getting the recipe…";
  }
}
