import type { Recipe, RecipeLink, RecipePagePlacement } from "@/types/recipe";
import { slimRecipe } from "@/lib/slimIngredients";

/**
 * Linked recipes: one recipe used in several projects (a cookbook and the
 * recipe cards printed from it), with edits kept in step.
 *
 * Every project still holds its own full copy of the recipe, so nothing that
 * draws, paginates, exports or saves a project changes. What a linked copy adds
 * is `QueueItem.link`: the shared record it belongs to (lib/linkedRecipeStore)
 * and the version of it this copy last agreed with, as one fingerprint per
 * recipe field. Comparing the copy, that agreed version and the record field by
 * field is what lets two places edit the same recipe without either silently
 * losing the other's change. This file is that comparison, and nothing else:
 * no Firestore, no React, so the rule can be pinned down by a plain test.
 *
 * Only the recipe itself is shared. How a project shows it (a cookbook's page
 * layout, photo crop, chapters, theme, which lines print) stays with the
 * project, because it lives outside `Recipe` already.
 */

/** Where "Print as recipe cards" leaves the lines the new cards should show
    for /print-cards (see `cardSwitchesFromCookbook`). Session storage: it only
    has to survive the one navigation. */
export const CARDS_FROM_COOKBOOK_KEY = "recipeprinter:cards-from-cookbook:v1";

/** "Make a cookbook" from recipe cards leaves this for /print-cards: the card
    project the book comes from, and how many of its recipes wait for the book
    to be bought (see `ProjectMeta.fillFromProjectId`). */
export const BOOK_FROM_CARDS_KEY = "recipeprinter:book-from-cards:v1";

/** One fingerprint per recipe field, keyed by field name. */
export type FieldPrints = Record<string, string>;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** FNV-1a, 32 bits, as hex. A field's fingerprint only has to tell two
    versions of the same field apart, and it is stored on every linked copy,
    so short beats strong. */
function fingerprint(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** An absent field and an empty one are not the same edit, but an absent
    field and one that is `undefined` are: Firestore drops the second. */
function presentKeys(recipe: Recipe): string[] {
  return Object.entries(recipe)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

/**
 * Fingerprints are taken of the recipe as a save stores it (`slimRecipe`): a
 * copy read back from the account has slimmed ingredients and one still in the
 * page does not, and those are the same recipe. Comparing them unslimmed made
 * a freshly opened copy look edited, and it wrote itself out for nothing.
 */
export function fieldPrints(recipe: Recipe): FieldPrints {
  const stored = slimRecipe(recipe);
  const prints: FieldPrints = {};
  for (const key of presentKeys(stored)) {
    prints[key] = fingerprint((stored as unknown as Record<string, unknown>)[key]);
  }
  return prints;
}

function printOf(recipe: Recipe, key: string): string | undefined {
  const value = (slimRecipe(recipe) as unknown as Record<string, unknown>)[key];
  return value === undefined ? undefined : fingerprint(value);
}

function allKeys(...sources: Array<Recipe | FieldPrints>): string[] {
  const keys = new Set<string>();
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) if (value !== undefined) keys.add(key);
  }
  return Array.from(keys);
}

/** The fields this copy has changed since it last agreed with its record. */
export function changedFields(recipe: Recipe, base: FieldPrints): string[] {
  return allKeys(recipe, base).filter((key) => printOf(recipe, key) !== base[key]);
}

export function hasLocalChanges(recipe: Recipe | undefined, link: RecipeLink | undefined): boolean {
  return Boolean(recipe && link && changedFields(recipe, link.base).length > 0);
}

export interface FieldConflict {
  field: string;
  /** What the other place had written into this field. Undefined means it
      removed the field. */
  theirs: unknown;
}

export interface LinkedMerge {
  /** The recipe both places should hold now. */
  recipe: Recipe;
  /** Fields this copy has to take from the record: present with the record's
      value, or present as `undefined` where the record removed the field. */
  fromRemote: Partial<Record<keyof Recipe, unknown>>;
  /** The merged recipe differs from the record, so the record must be written. */
  pushes: boolean;
  /** The same field edited both here and elsewhere, differently. The version
      on screen (this copy's) is kept, and the other is handed back so it can
      be offered as an Undo instead of disappearing. */
  conflicts: FieldConflict[];
}

/**
 * Field-by-field three-way merge of a linked copy with its record.
 *
 *  - Changed only here: this copy's value is written to the record.
 *  - Changed only elsewhere: the record's value comes into this copy.
 *  - Changed in both, to the same thing: nothing to do.
 *  - Changed in both, differently: a conflict. The copy on screen wins (it is
 *    what the cook is looking at and just did), and the other value is
 *    returned in `conflicts` so nothing is lost without the cook being told.
 *
 * `base` is the record as this copy last saw it. A copy with no edits of its
 * own therefore just takes the record, whatever it says.
 */
export function mergeLinked(local: Recipe, base: FieldPrints, remote: Recipe): LinkedMerge {
  const merged: Record<string, unknown> = { ...(local as unknown as Record<string, unknown>) };
  const fromRemote: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const remoteFields = remote as unknown as Record<string, unknown>;
  for (const key of allKeys(local, base, remote)) {
    const localPrint = printOf(local, key);
    const remotePrint = printOf(remote, key);
    const changedHere = localPrint !== base[key];
    const changedThere = remotePrint !== base[key];
    if (localPrint === remotePrint) continue;
    if (!changedHere) {
      merged[key] = remoteFields[key];
      fromRemote[key] = remoteFields[key];
      continue;
    }
    if (changedThere) conflicts.push({ field: key, theirs: remoteFields[key] });
  }
  const recipe = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as unknown as Recipe;
  const pushes = allKeys(recipe, remote).some((key) => printOf(recipe, key) !== printOf(remote, key));
  return { recipe, fromRemote: fromRemote as LinkedMerge["fromRemote"], pushes, conflicts };
}

/** A copy's recipe with the record's fields applied: what a pull writes. */
export function applyRemoteFields(recipe: Recipe, fromRemote: LinkedMerge["fromRemote"]): Recipe {
  const next: Record<string, unknown> = { ...(recipe as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(fromRemote)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as unknown as Recipe;
}

/**
 * The recipe as it should be shared out of a book.
 *
 * A book of the cook's own photos used to keep the photo they picked on the
 * BOOK (`placement.photoUrl`), not on the recipe, so a card printed from it
 * would show the website's photo instead. When a recipe is first linked, that
 * choice moves into the recipe, where every format reads it. `""` is a photo
 * the cook removed, which is a choice too.
 */
export function recipeToShare(
  recipe: Recipe,
  placement: RecipePagePlacement | undefined,
  ownPhotosOnly: boolean,
): Recipe {
  if (!ownPhotosOnly || recipe.imageChosen || placement?.photoUrl === undefined) return recipe;
  return { ...recipe, image: placement.photoUrl, imageChosen: true };
}

/** Undefined fields dropped, the way Firestore stores (and hands back) them. */
export function storedRecipe(recipe: Recipe): Recipe {
  return JSON.parse(JSON.stringify(slimRecipe(recipe))) as Recipe;
}

/** A link agreeing with `recipe` at record version `rev`. */
export function linkAt(id: string, rev: number, recipe: Recipe): RecipeLink {
  return { id, rev, base: fieldPrints(storedRecipe(recipe)) };
}
