import type { Recipe } from "@/types/recipe";

/**
 * A recipe is made of fields, and a theme decides which of them show and where.
 *
 * The data is the recipe's (`Recipe.description`, `.contributor`, ...). What a
 * theme does with it is its own: shown or not, kept per theme in
 * `ThemeLook.fields` (lib/themeLooks.ts) like its text size, so turning
 * Contributor on in Bistro leaves Garden as it was. Hiding a field never touches
 * the recipe, and an empty field never prints.
 *
 * The same placements are meant to drive every theme: the 17 built ones today,
 * and themes made from data later, which carry a list of placements of their own
 * instead of the default one here.
 *
 * Existing themes look as they always have. A theme no cook has switched a
 * field in stores nothing, and draws exactly what it drew before fields
 * existed: on a cookbook page that is the website's description and the cook's
 * note stacked in one paragraph under the title (`headnote`, lib/recipeNote.ts),
 * on a card neither. Only once a cook switches Description or Notes do they
 * become two fields: the description under the title, the note after the steps.
 */

/**
 * The fields a cook can show or hide, theme by theme: what each is called, the
 * label it prints with (none for the two paragraphs), and its value on a
 * recipe. Where each goes is the theme's (`headerParts`, `tailFields`).
 */
export const RECIPE_FIELDS = {
  description: { name: "Description", label: null, read: (recipe: Recipe) => recipe.description },
  contributor: { name: "Contributor", label: "Contributor", read: (recipe: Recipe) => recipe.contributor },
  category: { name: "Category", label: "Category", read: (recipe: Recipe) => recipe.category },
  note: { name: "Notes", label: "Notes", read: (recipe: Recipe) => recipe.note },
} as const;

export type RecipeFieldId = keyof typeof RECIPE_FIELDS;

/** A field's printable value, or "" when it has none (an empty field never
    prints). */
export function fieldValue(recipe: Recipe, id: RecipeFieldId): string {
  const value = RECIPE_FIELDS[id].read(recipe);
  return value?.trim() ? value : "";
}

export const RECIPE_FIELD_IDS = Object.keys(RECIPE_FIELDS) as RecipeFieldId[];

/** One theme's switches. A field never switched is absent. */
export type FieldSwitches = Partial<Record<RecipeFieldId, boolean>>;

/** Stored switches, read defensively: only known fields, only booleans. */
export function normalizeFieldSwitches(stored: unknown): FieldSwitches | undefined {
  if (!stored || typeof stored !== "object") return undefined;
  const switches: FieldSwitches = {};
  for (const id of RECIPE_FIELD_IDS) {
    const value = (stored as Record<string, unknown>)[id];
    if (typeof value === "boolean") switches[id] = value;
  }
  return Object.keys(switches).length > 0 ? switches : undefined;
}

/** Description and Notes as one paragraph under the title, as a cookbook page
    has always printed them, until a cook switches either one. */
export function usesHeadnote(switches: FieldSwitches | undefined, cookbook: boolean): boolean {
  return cookbook && switches?.description === undefined && switches?.note === undefined;
}

/**
 * Whether this theme shows a field. Unswitched, a theme shows what it always
 * did: a cookbook page its description and note, a card neither, and no theme
 * the new Contributor or Category.
 */
export function fieldShown(switches: FieldSwitches | undefined, id: RecipeFieldId, cookbook: boolean): boolean {
  const switched = switches?.[id];
  if (switched !== undefined) return switched;
  return cookbook && (id === "description" || id === "note");
}

/**
 * The header's parts, top to bottom. `byline` is Contributor and Category, one
 * labelled fact each, under the time and servings. A part only holds what the
 * theme shows, and the card skips one with nothing in it.
 */
export type HeaderPart = "title" | "headnote" | "description" | "details" | "byline" | "source";

export function headerParts(switches: FieldSwitches | undefined, cookbook: boolean): HeaderPart[] {
  if (usesHeadnote(switches, cookbook)) return ["title", "headnote", "details", "source"];
  const shown = (id: RecipeFieldId) => fieldShown(switches, id, cookbook);
  const parts: HeaderPart[] = ["title"];
  if (shown("description")) parts.push("description");
  parts.push("details");
  if (shown("contributor") || shown("category")) parts.push("byline");
  if (cookbook) parts.push("source");
  return parts;
}

/** The byline's fields this theme shows, in order. */
export function bylineFields(switches: FieldSwitches | undefined, cookbook: boolean): RecipeFieldId[] {
  return (["contributor", "category"] as const).filter((id) => fieldShown(switches, id, cookbook));
}

/**
 * One piece of what prints after the steps: a sentence or so of the cook's
 * note. `key` is what a page carries (`RecipeFace.tail`): "note:<paragraph>.<piece>".
 */
export interface TailPiece {
  key: string;
  paragraph: number;
  text: string;
}

/**
 * The note in pieces the page split can move one at a time, so a note longer
 * than a page runs on to the next one instead of being shrunk to fit. Split
 * at sentence ends, never inside bold or italic (an odd count of `*` so far
 * means a marker is still open, lib/richText.ts), and joined back together the
 * pieces are the paragraph exactly. No lookbehind: it crashes Safari < 16.4.
 */
export function notePieces(note: string): TailPiece[] {
  const pieces: TailPiece[] = [];
  note
    .split("\n")
    .filter((paragraph) => paragraph.trim())
    .forEach((paragraph, p) => {
      const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*)?\s*|[.!?]+\s*/g) ?? [paragraph];
      const merged: string[] = [];
      // Bold (`**`) and italic (`*`) counted apart: "**" is one marker, so
      // counting asterisks made a bold run look closed. A stray literal `*`
      // only means fewer places to split, never a broken run.
      let bold = 0;
      let italic = 0;
      for (const sentence of sentences) {
        if ((bold % 2 === 1 || italic % 2 === 1) && merged.length > 0) merged[merged.length - 1] += sentence;
        else merged.push(sentence);
        bold += sentence.match(/\*\*/g)?.length ?? 0;
        italic += sentence.replace(/\*\*/g, "").match(/\*/g)?.length ?? 0;
      }
      merged.forEach((text, i) => pieces.push({ key: `note:${p}.${i}`, paragraph: p, text }));
    });
  return pieces;
}

/** The first piece of the note, which carries its "Notes" label. */
export const FIRST_NOTE_PIECE = "note:0.0";

/**
 * What prints after the steps, in order: the cook's note, in pieces, when the
 * theme shows Notes on its own and this recipe has one. The page split moves
 * each piece like a step (lib/recipeCardLayout.ts,
 * components/RecipeFaceMeasurer.tsx), so an empty list is the split as it
 * always was.
 */
export function tailFields(recipe: Recipe, switches: FieldSwitches | undefined, cookbook: boolean): string[] {
  if (usesHeadnote(switches, cookbook) || !fieldShown(switches, "note", cookbook)) return [];
  return notePieces(fieldValue(recipe, "note")).map((piece) => piece.key);
}

/** The switches as a key for measured pages: a page measured with Notes at the
    foot is a different page from one measured without. */
export function fieldsKey(switches: FieldSwitches | undefined): string {
  return RECIPE_FIELD_IDS.map((id) => (switches?.[id] === undefined ? "-" : switches[id] ? "1" : "0")).join("");
}
