import type { QueueItem, Recipe, RecipePagePlacement, Section } from "@/types/recipe";

/**
 * Which photo a cookbook shows for one recipe.
 *
 * A book made before `ownPhotosOnly` shows the image the recipe imported with,
 * as it always has. A newer book shows the cook's own photos: one they added
 * (`placement.photoUrl`), or one that came out of their own file (a photo they
 * imported from, see lib/importedPhoto, or their Paprika export). A website's
 * image belongs to whoever published the recipe, so it shows only once the cook
 * turns on `websitePhotos` for the book.
 *
 * `photoUrl: ""` is the cook having removed the photo, which also hides the
 * imported one.
 */
export function bookRecipeImage(
  item: { method?: QueueItem["method"]; recipe?: Pick<Recipe, "image"> },
  placement: RecipePagePlacement | undefined,
  ownPhotosOnly: boolean | undefined,
  websitePhotos?: boolean,
): string | undefined {
  if (!ownPhotosOnly) return item.recipe?.image || undefined;
  if (placement?.photoUrl !== undefined) return placement.photoUrl || undefined;
  const ownFile = item.method === "image" || item.method === "paprika";
  return ownFile || websitePhotos ? item.recipe?.image || undefined : undefined;
}

/** Whether a recipe's imported photo is a website's, the kind a book of the
    cook's own photos holds back until `websitePhotos` is on. */
export function hasWebsitePhoto(item: { method?: QueueItem["method"]; recipe?: Pick<Recipe, "image"> }): boolean {
  return Boolean(item.recipe?.image) && item.method !== "image" && item.method !== "paprika";
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
  websitePhotos?: boolean,
): Section[] {
  if (!ownPhotosOnly) return sections;
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item): QueueItem => {
      if (!item.recipe) return item;
      const recipe = withImage(item.recipe, bookRecipeImage(item, placements?.[item.id], true, websitePhotos));
      return recipe === item.recipe ? item : { ...item, recipe };
    }),
  }));
}
