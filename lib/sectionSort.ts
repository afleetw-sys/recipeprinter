/**
 * A–Z within each section, and whether applying it would actually change
 * anything.
 *
 * Sorting a cookbook is a real reorder, not a view — the organizer shows the
 * book, so the pages themselves move. That makes "did this change anything?" a
 * question worth answering precisely: the sort is re-applied whenever recipes
 * are added or retitled, and a re-sort that commits an identical order would
 * write a new sections array on every render and loop.
 *
 * Section ORDER is never touched. Each section sorts within itself; which
 * chapter comes first is the cook's own decision.
 */

/** Case- and accent-insensitive, and "Recipe 10" sorts after "Recipe 9". */
export function compareRecipeTitles(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export function sortSectionsByTitle<Section extends { itemIds: string[] }>(
  sections: readonly Section[],
  titleFor: (itemId: string) => string,
): Section[] {
  return sections.map((section) => ({
    ...section,
    itemIds: [...section.itemIds].sort((a, b) => compareRecipeTitles(titleFor(a), titleFor(b))),
  }));
}

/** True when `next` orders any section's recipes differently from `current`. */
export function sectionOrderChanged(
  current: ReadonlyArray<{ itemIds: string[] }>,
  next: ReadonlyArray<{ itemIds: string[] }>,
): boolean {
  if (current.length !== next.length) return true;
  return current.some((section, index) => {
    const after = next[index]?.itemIds ?? [];
    if (section.itemIds.length !== after.length) return true;
    return section.itemIds.some((id, position) => id !== after[position]);
  });
}
