import type { Recipe } from "@/types/recipe";

/**
 * A recipe is made of fields. The book decides which of them show, and the
 * theme decides where.
 *
 * The data is the recipe's (`Recipe.description`, `.contributor`, ...). Whether
 * a field shows is the book's, for every recipe in it whatever its theme
 * (`ProjectMeta.fieldSwitches`, switched in Recipe details' "Show on recipes",
 * Amelia 2026-11-21). Hiding a field never touches the recipe, and an empty
 * field never prints.
 *
 * Where a field goes is the theme's placement: the 17 built themes share the
 * default one here, and themes made from data later can carry their own.
 *
 * A book no cook has switched a field in stores nothing, and draws exactly
 * what it drew before fields existed: on a cookbook page that is the website's
 * description and the cook's note stacked in one paragraph under the title
 * (`headnote`, lib/recipeNote.ts), on a card neither. Only once a cook switches
 * Description or Notes do they become two fields: the description under the
 * title, the note after the steps.
 */

/**
 * The recipe's own optional fields: what each is called, the
 * label it prints with (none for the two paragraphs), and its value on a
 * recipe. Where each goes is the theme's (`headerParts`, `tailFields`).
 */
export const RECIPE_FIELDS = {
  description: { name: "Description", label: null, read: (recipe: Recipe) => recipe.description },
  // Stored as `contributor`; shown as "Source" (Amelia, 2026-11-21): who or
  // where a family recipe came from.
  contributor: { name: "Source", label: "Source", read: (recipe: Recipe) => recipe.contributor },
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

/**
 * Everything "Show on recipes" can switch for itself: the optional fields, and
 * a recipe's cook time and servings. (The photo and the link have switches
 * too, but those are the book's own Photos and Recipe link settings; the
 * title, ingredients and steps always print.)
 */
export type FieldSwitchId = RecipeFieldId | "time" | "servings";

export const FIELD_SWITCH_IDS: FieldSwitchId[] = [...RECIPE_FIELD_IDS, "time", "servings"];

/**
 * One book's switches (`ProjectMeta.fieldSwitches`): every recipe in it,
 * whichever theme it's in (Amelia, 2026-11-21). A field never switched is
 * absent.
 */
export type FieldSwitches = Partial<Record<FieldSwitchId, boolean>>;

/** Stored switches, read defensively: only known fields, only booleans. */
export function normalizeFieldSwitches(stored: unknown): FieldSwitches | undefined {
  if (!stored || typeof stored !== "object") return undefined;
  const switches: FieldSwitches = {};
  for (const id of FIELD_SWITCH_IDS) {
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
 * Whether the book shows a field. Unswitched, a book shows what it always
 * did: cook time and servings everywhere, a cookbook page its description and
 * note, a card neither, and nothing the new Contributor or Category.
 */
export function fieldShown(switches: FieldSwitches | undefined, id: FieldSwitchId, cookbook: boolean): boolean {
  const switched = switches?.[id];
  if (switched !== undefined) return switched;
  if (id === "time" || id === "servings") return true;
  return cookbook && (id === "description" || id === "note");
}

/**
 * Whether Customize shows a field as ticked. On a cookbook page still printing
 * description and note as one paragraph, Notes reads unticked: they aren't on
 * their own yet, and ticking them is how they get there.
 */
export function fieldTicked(switches: FieldSwitches | undefined, id: FieldSwitchId, cookbook: boolean): boolean {
  if (id === "note" && usesHeadnote(switches, cookbook)) return false;
  return fieldShown(switches, id, cookbook);
}

/**
 * The switches with one field shown or hidden. A cookbook page printing
 * description and note together becomes two fields the moment either is
 * switched, and the other keeps printing: ticking Notes puts them at the
 * foot under a description that stays put; unticking Description leaves the
 * notes, now at the foot.
 */
export function withFieldShown(
  switches: FieldSwitches | undefined,
  id: FieldSwitchId,
  shown: boolean,
  cookbook: boolean,
): FieldSwitches {
  const split =
    usesHeadnote(switches, cookbook) && (id === "description" || id === "note")
      ? { description: true, note: true }
      : {};
  return { ...switches, ...split, [id]: shown };
}

/**
 * The header's parts, top to bottom. `byline` is Contributor and Category, one
 * labelled fact each, under the time and servings. A part only holds what the
 * theme shows, and the card skips one with nothing in it.
 */
export type HeaderPart = "title" | "headnote" | "description" | "details" | "byline" | "source";

export function headerParts(switches: FieldSwitches | undefined, cookbook: boolean): HeaderPart[] {
  const shown = (id: RecipeFieldId) => fieldShown(switches, id, cookbook);
  // The byline shows wherever it is switched on, including a cookbook page
  // still printing description and note as one paragraph: it used to be left
  // out there, so adding a source from "+" drew nothing.
  const byline: HeaderPart[] = shown("contributor") || shown("category") ? ["byline"] : [];
  if (usesHeadnote(switches, cookbook)) return ["title", "headnote", "details", ...byline, "source"];
  const parts: HeaderPart[] = ["title"];
  if (shown("description")) parts.push("description");
  parts.push("details", ...byline);
  if (cookbook) parts.push("source");
  return parts;
}

/** The byline's fields the book shows, in order. */
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
  return FIELD_SWITCH_IDS.map((id) => (switches?.[id] === undefined ? "-" : switches[id] ? "1" : "0")).join("");
}

/**
 * The lines recipe cards show when they are kept in step with a cookbook:
 * exactly the ones the book shows. Cards on their own hide the description
 * and notes by default, which a cookbook shows; on cards that are the same
 * recipes as the book, a description missing from the card but there in the
 * book reads as lost, so the cards start out matching the book instead.
 */
export function cardSwitchesFromCookbook(bookSwitches: FieldSwitches | undefined): FieldSwitches {
  return Object.fromEntries(FIELD_SWITCH_IDS.map((id) => [id, fieldShown(bookSwitches, id, true)])) as FieldSwitches;
}

/**
 * On cards kept in step with a cookbook these lines aren't switched on or off
 * card by card ("Show on recipes"): they are the recipe's own words, and
 * hiding one on the cards while the book shows it looks like the sync lost it.
 */
export const LINES_THAT_FOLLOW_THE_COOKBOOK: readonly FieldSwitchId[] = RECIPE_FIELD_IDS;

/** The recipe's lines, in the order the card reads, as the "+" list offers them. */
export type RecipeLineId =
  | "photo"
  | "description"
  | "contributor"
  | "category"
  | "time"
  | "servings"
  | "ingredients"
  | "steps"
  | "note"
  | "link";

export const RECIPE_LINE_ORDER: RecipeLineId[] = [
  "photo",
  "description",
  "contributor",
  "category",
  "time",
  "servings",
  "ingredients",
  "steps",
  "note",
  "link",
];

/**
 * The rows the "+" list offers a recipe: every line the book prints. One
 * switched off in "Show on recipes" is one the cook decided the book doesn't
 * print, so it isn't offered (Amelia, 2026-11-21); it comes back by switching
 * it on there. Photo and Link follow the book's photo and link settings;
 * ingredients and steps are always offered.
 */
export function addableRecipeLines(
  switches: FieldSwitches | undefined,
  cookbook: boolean,
  book: { photos: boolean; link: boolean },
): RecipeLineId[] {
  return RECIPE_LINE_ORDER.filter((line) => {
    if (line === "photo") return book.photos;
    if (line === "link") return book.link;
    if (line === "ingredients" || line === "steps") return true;
    return fieldShown(switches, line, cookbook);
  });
}
