/**
 * The words a book's own pages start with, line by line.
 *
 * A template page is never blank: every optional line (a cover's author, a
 * dedication's message and signature, a back cover's closing line) starts
 * with sample text that reads well printed as it is, the way the cover's
 * title already does. The cook types over it, or deletes it; a line deleted
 * to nothing is taken off the page and waits in the page toolbar's "+" menu,
 * which puts it back with these words. There are no "Add signature" prompts.
 *
 * Only books made with this (`sampleLines` on the book) show it for a line
 * that was never written. In an older book, a line still unwritten is a line
 * the cook left off, so it's treated as taken off: nothing a book already
 * printed changes, and the "+" menu offers it back.
 *
 * Keyed by the line's name on the page (CoverFace's `coverField`, DividerFace's
 * `openerField`). Pages the cook adds have none: an added page starts blank.
 */
export const SAMPLE_LINES: Record<string, string> = {
  "cover-kicker": "Recipes worth making again and again",
  "cover-byline": "From our family's kitchen",
  "cover-edition": "Family Edition",
  "dedication-text": "For everyone who's ever pulled up a chair at our table.",
  "dedication-signature": "With love, from our kitchen",
  "back-blurb": "Made with love, one recipe at a time.",
  "back-credit": "From our kitchen to yours",
  subtitle: "A few of our favorites",
};

/**
 * Whether a line is on the page. Written, it is; deleted (`""`), it isn't;
 * never written (`undefined`), it is in a book that starts with sample lines
 * and isn't in an older one.
 */
export function lineShown(value: string | undefined, sampleLines: boolean | undefined): boolean {
  if (value) return true;
  return value === undefined && Boolean(sampleLines);
}
