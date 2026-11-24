import type { QueueItem, Recipe, RecipePagePlacement, Section } from "@/types/recipe";
import type { PhotoStyle, ProjectMeta } from "@/lib/project";
import type { PageSheet } from "@/lib/usePrintSheets";

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

/**
 * The photo a recipe arrived with, once the cook has replaced it: the one
 * earlier photo its picker still offers.
 *
 * A recipe has one photo, so a new one changes it rather than adding to a
 * pile. A photo the cook uploaded and then replaced (a mistake, usually) is
 * gone from the picker; only the import's own photo stays, since there is no
 * other way back to it short of importing the recipe again.
 *
 * `photoHistory` is now only ever that one photo. Books from before kept every
 * replaced photo, newest first, so the import's photo, where there was one, is
 * the last of them.
 */
export function photoArrivedWith(history: readonly string[] | undefined): string | undefined {
  return history?.at(-1);
}

/**
 * The history to keep after `previous` (the photo being replaced) gives way to
 * a new one: the import's photo, either `previous` itself when the cook had
 * not chosen it, or the one already kept.
 */
export function historyAfterReplacing(
  previous: { image?: string; imageChosen?: boolean } | undefined,
  kept: readonly string[] | undefined,
): string[] | undefined {
  const arrived = previous?.image && !previous.imageChosen ? previous.image : photoArrivedWith(kept);
  return arrived ? [arrived] : undefined;
}

/**
 * The placement a recipe takes when a photo lands on it while it shows none:
 * imported from the cook's photo, picked in its photo dialog, or added by hand.
 * It follows the book's Photos, so a Full page book stays Full page. A book
 * set to None still shows the photo just added, in the page.
 */
export function photoModeForNewPhoto(bookStyle: PhotoStyle): PhotoStyle {
  return bookStyle === "none" ? "card" : bookStyle;
}

/**
 * The book with every photo still waiting to be added set to None: a full
 * page or in-page recipe photo, or a chapter's facing photo, that is still a
 * placeholder. The export prints what is there rather than refusing over a
 * page the cook may never fill, and the book is changed to match, so the
 * screen shows what was printed.
 *
 * Only a book of the cook's own photos has placeholders. Recipe placements
 * are written the way `setItemPhotoMode(id, "none")` writes them, keeping the
 * photo, history and link the cook set.
 */
export function withoutEmptyPhotos(
  meta: ProjectMeta,
  sheets: readonly PageSheet[],
): { meta: ProjectMeta; recipeIds: string[]; sectionIds: string[] } {
  if (!meta.ownPhotosOnly) return { meta, recipeIds: [], sectionIds: [] };
  const recipeIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const sheet of sheets) {
    for (const slot of sheet.slots) {
      if (slot?.kind === "image" && !slot.imageUrl) recipeIds.add(slot.recipeId);
      if (slot?.kind === "recipe" && slot.showPhoto && !slot.isContinuation && !slot.recipe.image) {
        recipeIds.add(slot.recipeId);
      }
      if (
        slot?.kind === "section-photo" &&
        slot.mode !== "none" &&
        !(slot.mode === "photo" ? slot.photoUrl : slot.gridImages?.length) &&
        !slot.caption?.trim()
      ) {
        sectionIds.add(slot.sectionId);
      }
    }
  }
  if (recipeIds.size === 0 && sectionIds.size === 0) return { meta, recipeIds: [], sectionIds: [] };
  const itemPlacements = { ...(meta.itemPlacements ?? {}) };
  for (const id of Array.from(recipeIds)) {
    const { showSourceUrl, photoUrl, photoHistory } = itemPlacements[id] ?? {};
    itemPlacements[id] = {
      pageLayout: "full",
      showPhoto: false,
      ...(showSourceUrl !== undefined ? { showSourceUrl } : {}),
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      ...(photoHistory?.length ? { photoHistory } : {}),
    };
  }
  return {
    meta: {
      ...meta,
      itemPlacements,
      sections: meta.sections.map((section) =>
        sectionIds.has(section.id) ? { ...section, artPhotoMode: "none" } : section,
      ),
    },
    recipeIds: Array.from(recipeIds),
    sectionIds: Array.from(sectionIds),
  };
}
