"use client";

import { createContext, useContext, type ReactNode } from "react";

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

/** The fields a cook can show or hide, theme by theme. */
export const RECIPE_FIELDS = {
  description: { name: "Description" },
  contributor: { name: "Contributor" },
  category: { name: "Category" },
  note: { name: "Notes" },
} as const;

export type RecipeFieldId = keyof typeof RECIPE_FIELDS;

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

/** The header's parts, top to bottom. */
export type HeaderPart = "title" | "headnote" | "details" | "source";

export function headerParts(switches: FieldSwitches | undefined, cookbook: boolean): HeaderPart[] {
  if (!cookbook) return ["title", "details"];
  return usesHeadnote(switches, cookbook) ? ["title", "headnote", "details", "source"] : ["title", "details", "source"];
}

const RecipeFieldsContext = createContext<FieldSwitches | undefined>(undefined);

/** Around a whole page (the print page, the export), the way ThemeArtProvider
    is, so every face and measurer reads the current theme's switches. */
export function RecipeFieldsProvider({ value, children }: { value: FieldSwitches | undefined; children: ReactNode }) {
  return <RecipeFieldsContext.Provider value={value}>{children}</RecipeFieldsContext.Provider>;
}

export function useFieldSwitches(): FieldSwitches | undefined {
  return useContext(RecipeFieldsContext);
}
