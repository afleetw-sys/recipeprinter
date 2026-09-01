/**
 * One row in a library you're importing from.
 *
 * Every source RecipePrinter can browse — a signed-in CookPilot account, a
 * Paprika export sitting in the browser — reduces to this before it reaches
 * the picker, so the list, the search and the Add/Added states are written
 * once instead of once per integration.
 *
 * `id` is the source's own id; `queueId` is what the recipe becomes in the
 * print list, namespaced by source so two libraries can never collide.
 */
export interface ImportSummary {
  id: string;
  queueId: string;
  title: string;
  imageURL?: string;
  servings?: string | number;
  totalTimeMinutes?: number;
  /** Everything this row can be found by, lowercased and joined by its source
      (title, tags, ingredient names…). Built where the data is, because only
      the source knows what it has. */
  searchText: string;
}

export function importSearchText(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Every term must match somewhere in the row — the same behaviour the
    CookPilot picker has always had, now shared by both sources. */
export function filterImportSummaries<T extends ImportSummary>(
  summaries: T[],
  queryText: string,
): T[] {
  const terms = queryText.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return summaries;
  return summaries.filter((summary) => terms.every((term) => summary.searchText.includes(term)));
}
