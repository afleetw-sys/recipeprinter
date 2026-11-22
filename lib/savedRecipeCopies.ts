import type { PrintProject, QueueItem } from "@/types/recipe";
import { recipeToShare } from "@/lib/linkedRecipes";
import { uid as newId } from "@/lib/ids";

/** A recipe picked from another saved project ("Your recipes"). */
export interface PickedRecipe {
  project: PrintProject;
  item: QueueItem;
}

/**
 * The copies "Your recipes" adds to the open project: separate copies, never
 * linked to the project they came from (Amelia, 2026-11-22). Picking a recipe
 * you already have is reusing it, not tying two projects together; an edit
 * here must not change the other project. Linking is only for a book and the
 * cards made from it (Make a cookbook, Print as recipe cards), where the cook
 * chose it with the "keep the same" box.
 *
 * The copy is the recipe as the other project shows it (`recipeToShare`: its
 * photo choice and a book's own-photos rule applied), the same content a
 * linked copy would have started with, just without the link.
 */
export function copiesOfPickedRecipes(chosen: PickedRecipe[]): QueueItem[] {
  return chosen.map(({ project, item }) => {
    const ownPhotosOnly = Boolean(project.settings?.cookbookMode && project.settings?.ownPhotosOnly);
    const recipe = recipeToShare(item.recipe!, project.itemPlacements?.[item.id], ownPhotosOnly);
    return {
      id: newId(),
      method: item.method,
      source: item.source,
      originalUrl: item.originalUrl,
      status: "ready",
      title: recipe.title || item.title,
      recipe,
      addedAt: Date.now(),
    };
  });
}
