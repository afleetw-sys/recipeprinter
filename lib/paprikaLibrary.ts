"use client";

import { importSearchText, type ImportSummary } from "@/lib/importSummary";
import type { PaprikaEntry, PaprikaLibrary } from "@/lib/paprikaImport";

/**
 * The Paprika export this browser currently has open.
 *
 * Module state, exactly like the CookPilot summary cache in
 * lib/cookpilotRecipes.ts and for the same reason: the picker unmounts every
 * time the import tab changes, and re-reading a 200MB archive because someone
 * looked at their CookPilot recipes for a second would be absurd. Someone
 * importing from both sources in one sitting moves between them freely, and
 * neither side loses anything.
 *
 * Deliberately not persisted. The recipes they added are in the queue, which
 * does persist; the rest is a file they still have, and asking for it again
 * after a reload is cheaper than holding a copy of their whole library.
 */
let openLibrary: PaprikaLibrary | null = null;

export function cachedPaprikaLibrary(): PaprikaLibrary | null {
  return openLibrary;
}

export function setPaprikaLibrary(library: PaprikaLibrary | null): void {
  if (openLibrary && openLibrary !== library) releaseThumbnails();
  openLibrary = library;
}

// Thumbnails render straight from the bytes already in memory — no IndexedDB
// write, no upload. Browsing a library costs nothing but the object URLs, and
// those are released when the library is replaced.
const thumbnails = new Map<string, string>();

function releaseThumbnails(): void {
  thumbnails.forEach((url) => URL.revokeObjectURL(url));
  thumbnails.clear();
}

export function paprikaThumbnail(entry: PaprikaEntry): string | undefined {
  if (!entry.photo) return undefined;
  const existing = thumbnails.get(entry.id);
  if (existing) return existing;
  const url = URL.createObjectURL(entry.photo);
  thumbnails.set(entry.id, url);
  return url;
}

/** Minutes, when the export gave a total time we can read as one. Paprika
    stores times as free text ("1 hr 20 min"), so this reads what it can and
    stays quiet about the rest rather than printing a wrong number. */
function totalMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const minutes = value.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (!hours && !minutes) {
    const bare = value.match(/^\s*(\d+)\s*$/);
    return bare ? Number(bare[1]) : undefined;
  }
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
}

export function paprikaImportSummary(entry: PaprikaEntry): ImportSummary {
  const { recipe } = entry;
  return {
    id: entry.id,
    queueId: entry.queueId,
    title: recipe.title,
    imageURL: paprikaThumbnail(entry),
    servings: recipe.servings,
    totalTimeMinutes: totalMinutes(recipe.totalTime ?? recipe.cookTime),
    searchText: importSearchText(
      recipe.title,
      recipe.sourceName,
      recipe.sourceUrl,
      ...(recipe.tags ?? []),
      ...recipe.ingredients.map((ingredient) => ingredient.name),
    ),
  };
}
