import type { PrintProject } from "@/types/recipe";
import { stripUndefined } from "@/lib/firebase/stripUndefined";
import { slimIngredients } from "@/lib/printProjects";

/**
 * Which device copy of a book, if any, should open instead of the account's.
 *
 * Opening a saved book used to load the account copy unconditionally. That is
 * right almost always and wrong in one case that loses work: an edit made just
 * before the tab closed is on the device (the mirrors write within 250 ms and
 * flush on pagehide) but never reached the account (autosave waits 1.5 s for
 * edits to settle, and Chrome tears a closing tab down before it lands).
 *
 * A device copy wins only when it is the account copy plus edits:
 *  - it is the same project;
 *  - it was based on the very revision the account still holds (see
 *    lib/workingBase), so nobody has saved since and nothing would be
 *    overwritten that the device never saw; a copy with no recorded base, from
 *    before this existed, never wins;
 *  - its content actually differs, read the way a save would write it.
 *
 * The first candidate that qualifies wins, so callers list them freshest first.
 */
export function newerLocalCopy(
  account: PrintProject,
  candidates: ReadonlyArray<PrintProject | null | undefined>,
): PrintProject | null {
  const accountRevision = Number(account.revision ?? 0);
  const accountContent = bookContent(account);
  for (const candidate of candidates) {
    if (!candidate || candidate.id !== account.id) continue;
    // No recorded base, or 0 (what a copy with nothing unsaved is filed as; no
    // account revision is 0): nothing says it is this version plus edits.
    if (!(Number(candidate.revision ?? 0) > 0)) continue;
    if (Number(candidate.revision) !== accountRevision) continue;
    if (bookContent(candidate) !== accountContent) return candidate;
  }
  return null;
}

/**
 * Bookkeeping a save adds or a copy derives, none of which is the book: who
 * owns it, which write it was, when, and the list view's summaries. `title` is
 * derived too (the shelf names a card job after its first recipe), while a
 * name the cook typed lives in `projectTitle` and is compared.
 */
const NOT_CONTENT = new Set([
  "id",
  "kind",
  "ownerUid",
  "revision",
  "saveId",
  "createdAt",
  "updatedAt",
  "contentVersion",
  "recipeCount",
  "coverThumbs",
  "title",
]);

/** The book as a save would write it, in a form that compares equal when the
    books are: slimmed and stripped like a save, keys in a fixed order (Firestore
    hands fields back in any order), bookkeeping left out. */
function bookContent(project: PrintProject): string {
  const written = stripUndefined(slimIngredients(project)) as unknown as Record<string, unknown>;
  const content = Object.fromEntries(Object.entries(written).filter(([key]) => !NOT_CONTENT.has(key)));
  return stableStringify(content);
}

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
