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
 *
 * A recipe whose `imageChosen` is set carries the cook's choice itself: it is
 * shown, or `""` shows none, in every book and on every card it is linked
 * into. `placement.photoUrl` is where books kept that choice before, and is
 * still read for a recipe that has never been given one.
 */
export function bookRecipeImage(
  item: { method?: QueueItem["method"]; recipe?: Pick<Recipe, "image" | "imageChosen"> },
  placement: RecipePagePlacement | undefined,
  ownPhotosOnly: boolean | undefined,
  websitePhotos?: boolean,
): string | undefined {
  if (!ownPhotosOnly) return item.recipe?.image || undefined;
  // A photo the cook chose is part of the recipe now, wherever it was chosen
  // (this book, another book, a recipe card). It wins over a choice older
  // books kept on the page, which a linked recipe's newer choice replaces.
  if (item.recipe?.imageChosen) return item.recipe.image || undefined;
  if (placement?.photoUrl !== undefined) return placement.photoUrl || undefined;
  const ownFile = item.method === "image" || item.method === "paprika";
  return ownFile || websitePhotos ? item.recipe?.image || undefined : undefined;
}

/** Whether a recipe's imported photo is a website's, the kind a book of the
    cook's own photos holds back until `websitePhotos` is on. */
export function hasWebsitePhoto(item: { method?: QueueItem["method"]; recipe?: Pick<Recipe, "image" | "imageChosen"> }): boolean {
  return (
    Boolean(item.recipe?.image) &&
    !item.recipe?.imageChosen &&
    item.method !== "image" &&
    item.method !== "paprika"
  );
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

/**
 * A full-page photo's crop, but only while it is still the photo it was made
 * for. A linked recipe's photo can change from another project, and a crop set
 * for one picture is wrong for another, so the new photo starts centred. A crop
 * recorded before `heroCropFor` existed keeps applying.
 */
export function heroCrop(
  placement: RecipePagePlacement | undefined,
  shownUrl: string | undefined,
): { focusX?: number; focusY?: number; zoom?: number } {
  if (!placement) return {};
  if (placement.heroCropFor !== undefined && placement.heroCropFor !== (shownUrl ?? "")) return {};
  return { focusX: placement.heroFocusX, focusY: placement.heroFocusY, zoom: placement.heroZoom };
}
