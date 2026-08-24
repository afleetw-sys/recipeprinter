"use client";

import { localStore } from "@/lib/storage";
import type { QueueItem } from "@/types/recipe";

const PROJECT_INDEX_KEY = "recipeprinter:project-index:v1";

/** Enough entries to cover a long history of printing without unbounded growth.
    Each is two short strings, so this is kilobytes, not megabytes. */
const MAX_INDEX_ENTRIES = 200;

type ProjectIndex = Record<string, { id: string; at: number }>;

/**
 * What a recipe IS, for the purpose of noticing you have printed it before.
 *
 * The source URL alone is not enough: `multiRecipe` means one roundup page
 * legitimately yields many different recipes, so a URL identifies a page rather
 * than a dish. Pasted and photographed recipes have no URL at all. So the key
 * is the URL and the title together, falling back to the title plus the first
 * ingredient — which is what separates two things both called "Pancakes".
 */
function recipeKey(item: QueueItem): string | null {
  const recipe = item.recipe;
  if (!recipe) return null;
  const title = recipe.title?.trim().toLowerCase();
  if (!title) return null;
  const url = recipe.sourceUrl?.trim().toLowerCase();
  if (url) return `u:${url}|${title}`;
  const first = recipe.ingredients?.[0]?.name?.trim().toLowerCase() ?? "";
  return `t:${title}|${first}`;
}

/**
 * A stable name for "this exact set of recipes, as this kind of document".
 *
 * Sorted, so re-ordering the same recipes is still the same project — order is
 * a layout decision, not a different set of things. The kind is part of the key
 * because a cookbook and a card run built from the same recipes are genuinely
 * two documents: one is a bound book someone may have paid for.
 *
 * Null when there is nothing identifiable to key on, which means "do not
 * dedupe" rather than "everything matches".
 */
export function projectContentKey(items: readonly QueueItem[], cookbook: boolean): string | null {
  const keys = items
    .filter((item) => item.status === "ready" && item.recipe)
    .map(recipeKey)
    .filter((key): key is string => Boolean(key));
  if (keys.length === 0) return null;
  return `${cookbook ? "book" : "cards"}::${[...keys].sort().join("~")}`;
}

function readIndex(): ProjectIndex {
  const parsed = localStore.getJson<ProjectIndex>(PROJECT_INDEX_KEY);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
}

/**
 * The project this content was filed as last time, if it ever was.
 *
 * This index exists SEPARATELY from the shelf because the shelf forgets. Once a
 * project reaches an account, `pruneLocalProjects` deletes the device copy — so
 * a signed-in cook who printed the same recipes twice would find nothing on the
 * shelf to match against and mint a second project every single time, which is
 * exactly the duplicate-everything behaviour this fixes. The index is only
 * ids, so it can outlive the documents it points at cheaply.
 */
export function lookupProjectId(contentKey: string | null): string | null {
  if (!contentKey) return null;
  return readIndex()[contentKey]?.id ?? null;
}

/** Records which project this content became, for the next time it turns up. */
export function rememberProjectId(contentKey: string | null, id: string): void {
  if (!contentKey || !id) return;
  const index = readIndex();
  index[contentKey] = { id, at: Date.now() };

  const entries = Object.entries(index);
  if (entries.length > MAX_INDEX_ENTRIES) {
    entries.sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0));
    const trimmed: ProjectIndex = {};
    for (const [key, value] of entries.slice(0, MAX_INDEX_ENTRIES)) trimmed[key] = value;
    localStore.setJson(PROJECT_INDEX_KEY, trimmed);
    return;
  }
  localStore.setJson(PROJECT_INDEX_KEY, index);
}

/** Drops an entry — used when the project it names is deleted, so printing the
    same recipes afterwards starts a genuinely new project. */
export function forgetProjectId(id: string): void {
  const index = readIndex();
  let changed = false;
  for (const [key, value] of Object.entries(index)) {
    if (value.id === id) {
      delete index[key];
      changed = true;
    }
  }
  if (changed) localStore.setJson(PROJECT_INDEX_KEY, index);
}
