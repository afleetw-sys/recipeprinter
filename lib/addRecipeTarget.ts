import type { NavItem } from "@/lib/usePrintSheets";

export interface AddTargetSection {
  id: string;
  items: ReadonlyArray<{ id: string }>;
}

export interface AddRecipeTarget {
  sectionId: string;
  /** Position inside the section the new recipe takes. */
  index: number;
  /** What the loading placeholder follows: a recipe id, a chapter id (the
      placeholder then sits just after its opener), or null for "goes last". */
  anchorId: string | null;
}

/**
 * Where "Add recipes" puts a recipe, given the page the cook is looking at.
 *
 * A recipe's page, and the photo facing it, mean "right after this recipe". A
 * chapter opener, and the photo facing it, mean "at the top of this chapter".
 * Everything else (the cover, the contents, the dedication, or no page at all)
 * has no place in the book of its own, so the recipe goes where an unplaced
 * one always has: the end. Those used to fall through to the top of the FIRST
 * chapter while the loading placeholder was parked at the end, so where a new
 * recipe landed depended on which kind of page happened to be on screen, and
 * disagreed with the placeholder that promised somewhere else.
 */
export function addRecipeTarget(
  navItem: NavItem | null,
  sections: readonly AddTargetSection[],
): AddRecipeTarget | null {
  if (sections.length === 0) return null;

  if (navItem?.kind === "recipe" || navItem?.kind === "image") {
    for (const section of sections) {
      const at = section.items.findIndex((item) => item.id === navItem.recipeId);
      if (at !== -1) return { sectionId: section.id, index: at + 1, anchorId: navItem.recipeId };
    }
  }

  if (navItem?.kind === "divider" || navItem?.kind === "section-photo") {
    const section = sections.find((candidate) => candidate.id === navItem.recipeId);
    if (section) return { sectionId: section.id, index: 0, anchorId: section.id };
  }

  const last = sections[sections.length - 1]!;
  return {
    sectionId: last.id,
    index: last.items.length,
    anchorId: last.items.at(-1)?.id ?? null,
  };
}
