import { ingredientText } from "@/lib/recipeCardLayout";
import type { QueueItem, RecipePagePlacement } from "@/types/recipe";

/**
 * Search and readiness filters for the cookbook organizer.
 *
 * A view, never an edit: nothing here moves or changes a recipe. The organizer
 * simply leaves out the tiles that do not match, and a drag onto a tile that is
 * showing still lands next to that recipe in the real book order.
 */

/** What the organizer knows about one recipe tile beyond the recipe itself. */
export interface OrganizeRecipeContext {
  item: QueueItem;
  /** The chapter it sits in, blank when it is in no named chapter. */
  chapterTitle: string;
  placement?: RecipePagePlacement;
  /** The book shows only photos the cook added (see lib/bookPhotos.ts). */
  ownPhotosOnly?: boolean;
  /** How many printed pages the recipe card itself runs to. */
  pageCount: number;
}

/** The things that still stand between a recipe and a finished cookbook. */
export type OrganizeFilter =
  | "no-photo"
  | "no-ingredients"
  | "no-steps"
  | "no-chapter"
  | "two-pages";

export const ORGANIZE_FILTER_OPTIONS: Array<{ value: OrganizeFilter; label: string }> = [
  { value: "no-photo", label: "No photo" },
  { value: "no-ingredients", label: "No ingredients" },
  { value: "no-steps", label: "No steps" },
  { value: "no-chapter", label: "Not in a chapter" },
  { value: "two-pages", label: "Runs onto a second page" },
];

const hasText = (value: string | undefined | null) => Boolean(value && value.trim());

/** A recipe has a photo when either its own image or a chosen facing-page
    photo is set. Whether the book currently PRINTS it is a setting, not a
    missing photo. */
export function hasPhoto(context: OrganizeRecipeContext): boolean {
  if (context.ownPhotosOnly) return hasText(context.placement?.photoUrl);
  return hasText(context.item.recipe?.image) || hasText(context.placement?.heroImageUrl);
}

export function matchesFilter(filter: OrganizeFilter, context: OrganizeRecipeContext): boolean {
  const recipe = context.item.recipe;
  switch (filter) {
    case "no-photo":
      return !hasPhoto(context);
    case "no-ingredients":
      return !recipe?.ingredients?.some((ingredient) => hasText(ingredientText(ingredient)));
    case "no-steps":
      return !recipe?.instructions?.some((step) => hasText(step.text));
    case "no-chapter":
      return !hasText(context.chapterTitle);
    case "two-pages":
      return context.pageCount > 1;
  }
}

/** Lower-cased, accents dropped, so "creme" finds "Crème brûlée". */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Every piece of text a cook might remember a recipe by. */
function searchableText(context: OrganizeRecipeContext): string {
  const { item, chapterTitle } = context;
  const recipe = item.recipe;
  const parts: Array<string | undefined> = [
    recipe?.title || item.title,
    chapterTitle,
    item.source,
    recipe?.sourceName,
    recipe?.sourceUrl,
    recipe?.author,
    recipe?.description,
    recipe?.note,
    recipe?.cuisine,
    recipe?.course,
    ...(recipe?.tags ?? []),
    ...(recipe?.ingredients ?? []).map((ingredient) => ingredientText(ingredient)),
    ...(recipe?.ingredients ?? []).map((ingredient) => ingredient.section),
    ...(recipe?.instructions ?? []).map((step) => step.text),
    ...(recipe?.instructions ?? []).map((step) => step.section),
  ];
  return normalizeSearchText(parts.filter(Boolean).join("\n"));
}

/** Every word of the query has to appear somewhere in the recipe, in any
    order, so "chicken lemon" finds a lemon chicken. An empty query matches. */
export function matchesSearch(query: string, context: OrganizeRecipeContext): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = searchableText(context);
  return words.every((word) => text.includes(word));
}

/** What the organizer is narrowed to: a search, plus any number of
    readiness filters. */
export interface OrganizeView {
  query: string;
  filters: readonly OrganizeFilter[];
}

/**
 * The filters are all one question, "what still needs work?", so ticking two
 * shows recipes with EITHER problem: "No photo" plus "No steps" is the list of
 * recipes to go and fix, not only the ones missing both. The search narrows
 * whatever that leaves.
 */
export function matchesOrganizeView(view: OrganizeView, context: OrganizeRecipeContext): boolean {
  const passesFilters =
    view.filters.length === 0 || view.filters.some((filter) => matchesFilter(filter, context));
  return passesFilters && matchesSearch(view.query, context);
}

export function isOrganizeViewActive(view: OrganizeView): boolean {
  return view.filters.length > 0 || view.query.trim() !== "";
}
