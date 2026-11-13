import type { Recipe } from "@/types/recipe";
import { sessionStore } from "@/lib/storage";

/**
 * The recipes one import found, waiting for the cook to choose which to add.
 *
 * A roundup link (or any parse that answers with several recipes) only asks
 * when something leaves some of them out: a free account adds one recipe
 * outside a cookbook, and an unbought cookbook has its free preview size. Pro
 * and a bought cookbook take everything without asking (see `choiceLimit`).
 * The picker (components/FoundRecipesDialog) also offers the way to all of
 * them: Pro, or buying the cookbook.
 *
 * The import is metered when it starts, but its meter entry only settles once
 * the cook has chosen: closing the picker settles it as a failure, so a link
 * they didn't want anything from never counts toward their free imports.
 *
 * It has to outlive the page: the picker's way to Pro goes through sign-in,
 * which is a redirect on a phone, and checkout can reload the page. Its
 * placeholder stays a live import through that reload (see `parseIsLive` in
 * lib/queue), rather than turning into an interrupted one. So it
 * lives in this tab's session storage, gone with the tab and never synced.
 * The page drops it once its placeholder is no longer in the queue.
 */
export interface RecipeChoice {
  /** The placeholder queue item the import started as. */
  itemId: string;
  source: "url" | "image" | "text";
  /** Everything the import found, in the page's order. Always more than one. */
  recipes: Recipe[];
  /** Whether the import holds a meter reservation that settles on choosing. */
  metered: boolean;
  /** The recipe Change recipe is replacing with this import, if any. Kept
      here because the page's own record of the swap doesn't survive the
      reload on the way to Pro. */
  replacesId?: string;
}

/**
 * The most recipes one import can add, or `null` for all of them.
 *
 * - Pro outside a cookbook, and a bought cookbook: all of them.
 * - Free outside a cookbook: one.
 * - An unbought cookbook: what fits its free preview, and always at least one,
 *   the same as an import that was under way when the book filled.
 */
export function choiceLimit(gates: { singleRecipeOnly: boolean; bookRoom: number | null }): number | null {
  if (gates.singleRecipeOnly) return 1;
  if (gates.bookRoom !== null) return Math.max(1, gates.bookRoom);
  return null;
}

/** Whether `found` recipes from one import need the cook to choose: only when
    the limit leaves some of them out. A cookbook with room for them all just
    takes them. */
export function needsChoice(found: number, limit: number | null): boolean {
  return found > 1 && limit !== null && limit < found;
}

const STORAGE_KEY = "recipeprinter:recipe-choice:v1";

export function readRecipeChoice(): RecipeChoice | null {
  try {
    const raw = sessionStore.get(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<RecipeChoice>) : null;
    if (!parsed || typeof parsed.itemId !== "string" || !Array.isArray(parsed.recipes)) return null;
    if (parsed.recipes.length < 2) return null;
    return {
      itemId: parsed.itemId,
      source: parsed.source === "image" || parsed.source === "text" ? parsed.source : "url",
      recipes: parsed.recipes,
      metered: parsed.metered === true,
      ...(typeof parsed.replacesId === "string" ? { replacesId: parsed.replacesId } : {}),
    };
  } catch {
    return null;
  }
}

export function storeRecipeChoice(choice: RecipeChoice | null): void {
  if (choice) sessionStore.set(STORAGE_KEY, JSON.stringify(choice));
  else sessionStore.remove(STORAGE_KEY);
}
