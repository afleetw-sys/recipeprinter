import type { QueueItem, Recipe, RecipePagePlacement, Section } from "@/types/recipe";

/**
 * Which photo a cookbook shows for one recipe.
 *
 * A book made before `ownPhotosOnly` shows the image the recipe imported with,
 * as it always has. A newer book shows only a photo the cook added
 * (`placement.photoUrl`), which they upload. The imported image is not used
 * or offered at all: it belongs to whoever published the recipe.
 */
export function bookRecipeImage(
  recipe: Pick<Recipe, "image"> | undefined,
  placement: RecipePagePlacement | undefined,
  ownPhotosOnly: boolean | undefined,
): string | undefined {
  if (ownPhotosOnly) return placement?.photoUrl || undefined;
  return recipe?.image || undefined;
}

// One substituted recipe per (recipe, photo) pair, so the layout engine's
// measurement cache (which checks recipe identity) survives every unrelated
// render instead of re-measuring the whole book.
const substituted = new WeakMap<Recipe, Map<string, Recipe>>();

function withImage(recipe: Recipe, image: string | undefined): Recipe {
  if ((recipe.image || undefined) === image) return recipe;
  let byImage = substituted.get(recipe);
  if (!byImage) {
    byImage = new Map();
    substituted.set(recipe, byImage);
  }
  const key = image ?? "";
  let next = byImage.get(key);
  if (!next) {
    next = { ...recipe, image };
    byImage.set(key, next);
  }
  return next;
}

/**
 * The sections as the BOOK sees them: each recipe's `image` replaced by the
 * photo the book shows (see `bookRecipeImage`). For rendering only. Saving or
 * editing from these would write the substitution over the recipe's own
 * imported image, so those keep reading the real items.
 */
export function sectionsWithBookPhotos(
  sections: Section[],
  placements: Record<string, RecipePagePlacement> | undefined,
  ownPhotosOnly: boolean | undefined,
): Section[] {
  if (!ownPhotosOnly) return sections;
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item): QueueItem => {
      if (!item.recipe) return item;
      const recipe = withImage(item.recipe, bookRecipeImage(item.recipe, placements?.[item.id], true));
      return recipe === item.recipe ? item : { ...item, recipe };
    }),
  }));
}
