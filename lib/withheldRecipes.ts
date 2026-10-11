import type { Recipe } from "@/types/recipe";
import { sessionStore } from "@/lib/storage";

/**
 * The recipes a link or photo import found but didn't add, because the free
 * plan adds one recipe at a time (see `MultiRecipeBlockedInfo` in lib/queue).
 *
 * The upgrade dialog that reports them says upgrading adds the rest, so they
 * have to outlive the way to Pro: a phone's sign-in is a redirect and checkout
 * can reload the page, and both would lose anything kept in React state. They
 * live in this tab's session storage: gone with the tab, never synced, and
 * never another project's (the page drops them once their first recipe is no
 * longer in the queue).
 */
export interface WithheldRecipes {
  /** The queue item the first recipe of the import landed on. */
  itemId: string;
  source: "url" | "image";
  recipes: Recipe[];
}

const STORAGE_KEY = "recipeprinter:withheld-recipes:v1";

export function readWithheldRecipes(): WithheldRecipes | null {
  try {
    const raw = sessionStore.get(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<WithheldRecipes>) : null;
    if (!parsed || typeof parsed.itemId !== "string" || !Array.isArray(parsed.recipes)) return null;
    if (parsed.recipes.length === 0) return null;
    return {
      itemId: parsed.itemId,
      source: parsed.source === "image" ? "image" : "url",
      recipes: parsed.recipes,
    };
  } catch {
    return null;
  }
}

export function storeWithheldRecipes(withheld: WithheldRecipes | null): void {
  if (withheld) sessionStore.set(STORAGE_KEY, JSON.stringify(withheld));
  else sessionStore.remove(STORAGE_KEY);
}
