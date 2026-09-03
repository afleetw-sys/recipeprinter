/**
 * Where the "Getting recipe…" spinners sit in the page rail while an import is
 * in flight, and whether they take their section's nesting line.
 *
 * Pure, and separate from `PageRail`, because this rule has now been wrong
 * twice in two different ways — once drawing the spinner under every page of a
 * multi-page recipe, once dropping it at the bottom of the rail when its
 * section had no recipe to sit after — and neither was catchable without a live
 * import to watch.
 */

/**
 * The index of the row the spinners hang under, or -1 for "nothing to anchor
 * to, put them at the end".
 *
 * Two rules, in order:
 *
 *  1. Under the LAST row belonging to `afterRecipeId`. A recipe that runs to
 *     two pages is two rows carrying the same id, so a plain `findIndex` drew
 *     the spinner under the first page and left the second below it. The anchor
 *     is a position, not an id.
 *  2. Failing that (the recipe is the FIRST going into its section, so there is
 *     nothing to sit after), under the last row of the target section — its
 *     chapter opener at minimum. Without this the spinner left the chapter
 *     entirely and appeared at the bottom of the rail.
 */
export function pendingAnchorIndex<Row>(
  rows: readonly Row[],
  options: {
    afterRecipeId: string | null;
    sectionId: string | null;
    recipeIdOf: (row: Row) => string | null | undefined;
    sectionIdOf: (row: Row) => string | null | undefined;
  },
): number {
  const { afterRecipeId, sectionId, recipeIdOf, sectionIdOf } = options;

  if (afterRecipeId) {
    return rows.reduce((last, row, i) => (recipeIdOf(row) === afterRecipeId ? i : last), -1);
  }
  if (sectionId) {
    return rows.reduce((last, row, i) => (sectionIdOf(row) === sectionId ? i : last), -1);
  }
  return -1;
}

/**
 * Whether a section draws the rail's nesting line — the same test each row
 * makes for itself, asked about the section an import is landing IN.
 *
 * Asked of the target section rather than of the row the spinner sits under,
 * because those disagree exactly when the import is a section's first recipe:
 * the row it anchors to is then the chapter opener, which is not itself a
 * child of the section.
 */
export function sectionDrawsNestingLine(
  sectionId: string | null,
  sections: ReadonlyArray<{ id: string; title?: string }>,
  titleForId: (sectionId: string) => string,
): boolean {
  if (!sectionId) return false;
  const section = sections.find((entry) => entry.id === sectionId);
  return Boolean(section?.title?.trim()) && titleForId(sectionId) !== "section";
}
