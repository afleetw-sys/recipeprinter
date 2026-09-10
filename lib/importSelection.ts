/**
 * Choosing recipes in a library picker, before any of them are added.
 *
 * The pickers used to write straight through: every tick added one recipe to
 * the print list and every untick removed it again. That made the checkmarks a
 * VIEW of the queue rather than a choice being made, with three consequences.
 * Closing the picker halfway through left a half-written list behind. Changing
 * your mind cost a real removal instead of a click. And "Add all" had to be a
 * separate code path, because there was no such thing as a selection for it to
 * fill.
 *
 * So the picker holds its own set and commits once. What is in the print list
 * already stays visible as such, and is not selectable — it is there, and the
 * place to take it back out is the print page.
 *
 * Selection is keyed by `queueId` (the id the recipe will have in the print
 * list) so the "already added" test and the selection test speak the same
 * language, and a selection survives the library paging more rows in.
 */

import type { ImportSummary } from "@/lib/importSummary";

/** Rows that can still be chosen: everything not already in the print list. */
export function selectableQueueIds(
  rows: ImportSummary[],
  addedIds: ReadonlySet<string>,
): string[] {
  return rows.map((row) => row.queueId).filter((queueId) => !addedIds.has(queueId));
}

/**
 * Tick or untick one row.
 *
 * Returns a new Set so React sees the change. Insertion order is click order,
 * which is the order the recipes are added in, so a cook who picks three in a
 * deliberate order gets them that way round in the print list.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  queueId: string,
): Set<string> {
  const next = new Set(selected);
  if (!next.delete(queueId)) next.add(queueId);
  return next;
}

/**
 * Whether the header control should read "Clear selection" rather than
 * "Select all".
 *
 * Rows already in the print list don't count either way: a library entirely
 * added has nothing left to select, so the control has nothing to offer and
 * the caller hides it.
 */
export function allSelectableSelected(
  rows: ImportSummary[],
  addedIds: ReadonlySet<string>,
  selected: ReadonlySet<string>,
): boolean {
  const selectable = selectableQueueIds(rows, addedIds);
  return selectable.length > 0 && selectable.every((queueId) => selected.has(queueId));
}

/** The commit button. Disabled at zero, but still says what it is for. */
export function addSelectedLabel(count: number): string {
  if (count === 0) return "Add to your print list";
  return `Add ${count} ${count === 1 ? "recipe" : "recipes"}`;
}

/**
 * What to say when a commit brought some of the batch over and not the rest.
 *
 * Adding fifty recipes reads fifty documents, and one of those can fail on its
 * own. Losing the other forty-nine to it would be the worst possible answer, so
 * the ones that loaded are added and the ones that did not stay selected —
 * which makes trying again a single click on a button that already says how
 * many are left. This is the sentence that explains that state.
 *
 * Empty string when nothing failed, so the caller can hand it straight to its
 * error slot.
 */
export function partialAddMessage(added: number, failed: number): string {
  if (failed === 0) return "";
  if (added === 0) {
    return failed === 1
      ? "We couldn't add that recipe. Please try again."
      : "We couldn't add those recipes. Please try again.";
  }
  return `${added} ${added === 1 ? "recipe is" : "recipes are"} in your print list. ${failed} ${
    failed === 1 ? "is" : "are"
  } still selected, ready to try again.`;
}
