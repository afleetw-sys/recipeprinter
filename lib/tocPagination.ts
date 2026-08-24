import type { TocEntry } from "@/lib/usePrintSheets";

/**
 * Splitting the table of contents across pages.
 *
 * The contents page is a fixed-height printed page with a list that can be any
 * length, so a big book overran it: the entries past the bottom edge were
 * simply clipped (`.recipe-card--toc` is `overflow: hidden`), and the recipes
 * that fell off had no listing at all. This measures the list the way the page
 * will lay it out and cuts it into as many pages as it needs.
 *
 * Geometry is in inches to match the CSS it mirrors (see `.recipe-card--toc`
 * and friends in app/print/print.css) — the page is a physical object, so real
 * units are the honest way to reason about it. Every constant below is one
 * declaration over there; keep the two in step.
 */

// The cookbook page and its contents padding: 10.75in tall, 1.05in top and
// bottom (`.recipe-print-preview--letter`, `.recipe-card--toc`).
const PAGE_HEIGHT_IN = 10.75;
const PAGE_PADDING_Y_IN = 1.05;
const CONTENT_HEIGHT_IN = PAGE_HEIGHT_IN - PAGE_PADDING_Y_IN * 2;

// First page: the "CONTENTS" kicker (0.13in type on a 0.195in line, 0.08in
// below it) over the big heading (25pt × 1.5 = 0.52in, line-height 1, with
// 0.46in below).
const FIRST_HEADING_IN = 0.195 + 0.08 + 0.521 + 0.46;
// A continuation page carries only the small "continued" kicker and its own
// breathing room (`.recipe-card__toc-kicker--continued`), so nearly the whole
// page is list.
const CONTINUED_HEADING_IN = 0.195 + 0.3;

// A chapter line: 0.2in type on a 0.24in line, 0.13in under it, and 0.3in of
// air above — which is dropped when the chapter opens a page (`:first-child`).
const CHAPTER_LINE_IN = 0.3;
const CHAPTER_BELOW_IN = 0.13;
const CHAPTER_ABOVE_IN = 0.3;
// A recipe line: 0.155in type on a 0.2325in line, with 0.075in margins that
// collapse between neighbours — so each line costs its height plus one gap.
const RECIPE_LINE_IN = 0.2325;
const RECIPE_GAP_IN = 0.075;

// Recipe names are clipped to one line (`white-space: nowrap` + ellipsis), but
// a long chapter name wraps. At 0.2in uppercase type with letter-spacing over
// the ~6.2in the name has to itself, a second line starts somewhere around 48
// characters — in the theme measured. Themes set their own title font, so this
// deliberately guesses low: reserving a second line that doesn't appear costs a
// little white space at the foot of one page, while missing one that does
// appear puts a line back over the edge this whole module exists to stop.
const CHAPTER_CHARS_PER_LINE = 38;

// Held back at the bottom of every contents page for the same reason: the line
// heights below are the CSS's, but the type inside them is the theme's.
const SAFETY_IN = 0.1;

function chapterHeight(entry: TocEntry): number {
  const lines = Math.max(1, Math.ceil(entry.title.trim().length / CHAPTER_CHARS_PER_LINE));
  return CHAPTER_LINE_IN * lines + CHAPTER_BELOW_IN;
}

/**
 * Cuts `entries` into one array per contents page, in order. The first page
 * makes room for the full heading, later pages only for the small continued
 * kicker. Always returns at least one page (empty in, one empty page out —
 * callers decide whether an empty contents is worth printing).
 *
 * Two rules a real book's contents follows, and this one now does too:
 *  - A chapter heading is never stranded as the last line of a page; it moves
 *    down to open the next one.
 *  - A chapter whose recipes run past the bottom of a page repeats its heading
 *    at the top of the next, marked `continued`. Without it the overflow lines
 *    read as an unlabelled list, and the reader has to turn back a page to find
 *    out whose recipes they are.
 */
export function paginateTocEntries(entries: TocEntry[]): TocEntry[][] {
  const pages: TocEntry[][] = [];
  let page: TocEntry[] = [];
  let used = 0;
  let available = CONTENT_HEIGHT_IN - FIRST_HEADING_IN - SAFETY_IN;
  // The chapter whose recipes are being listed right now — what a page break in
  // the middle of a chapter carries over as its repeated heading.
  let openChapter: TocEntry | null = null;

  const startNewPage = (carried: TocEntry | null) => {
    pages.push(page);
    page = [];
    used = 0;
    available = CONTENT_HEIGHT_IN - CONTINUED_HEADING_IN - SAFETY_IN;
    if (!carried) return;
    // The repeat keeps the chapter's OWN page number: it is the same entry
    // pointing at the same place, shown again for orientation, not a new one.
    const heading: TocEntry = { ...carried, continued: true };
    page.push(heading);
    used = chapterHeight(heading);
  };

  entries.forEach((entry, index) => {
    const openingPage = page.length === 0;
    const height =
      entry.kind === "chapter"
        ? chapterHeight(entry) + (openingPage ? 0 : CHAPTER_ABOVE_IN)
        : RECIPE_LINE_IN + RECIPE_GAP_IN;
    // A chapter that would sit alone at the foot of a page starts the next one
    // instead — a heading with nothing under it is just a widow.
    const stranded =
      entry.kind === "chapter" && entries[index + 1] !== undefined
        ? used + height + RECIPE_LINE_IN + RECIPE_GAP_IN > available
        : false;
    if (!openingPage && (used + height > available || stranded)) {
      // A recipe carried onto a new page takes its chapter's heading with it; a
      // chapter carries itself, so it never needs (or gets) a repeat.
      startNewPage(entry.kind === "recipe" ? openChapter : null);
      // Re-price the entry now that it opens a page (no leading air).
      used += entry.kind === "chapter" ? chapterHeight(entry) : RECIPE_LINE_IN + RECIPE_GAP_IN;
      page.push(entry);
      if (entry.kind === "chapter") openChapter = entry;
      return;
    }
    used += height;
    page.push(entry);
    if (entry.kind === "chapter") openChapter = entry;
  });

  pages.push(page);
  return pages;
}
