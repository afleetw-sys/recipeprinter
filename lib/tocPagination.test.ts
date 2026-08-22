import { describe, expect, it } from "vitest";
import { paginateTocEntries } from "@/lib/tocPagination";
import type { TocEntry } from "@/lib/usePrintSheets";

const recipe = (title: string): TocEntry => ({ kind: "recipe", title, pageNumber: 1 });
const chapter = (title: string): TocEntry => ({ kind: "chapter", title, pageNumber: 1 });
const recipes = (count: number, from = 1): TocEntry[] =>
  Array.from({ length: count }, (_, i) => recipe(`Recipe ${from + i}`));

describe("paginateTocEntries", () => {
  it("keeps a contents that fits on one page", () => {
    const pages = paginateTocEntries([chapter("Mains"), ...recipes(8)]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(9);
  });

  it("runs a long contents onto continuation pages, losing no entry", () => {
    const entries = [chapter("Everything"), ...recipes(120)];
    const pages = paginateTocEntries(entries);
    expect(pages.length).toBeGreaterThan(1);
    // Repeated chapter headings are the only additions; the listing itself is
    // exactly what went in, in order.
    expect(pages.flat().filter((entry) => !entry.continued)).toEqual(entries);
  });

  it("repeats the chapter heading, and its page number, when its recipes run over", () => {
    const entries = [chapter("Desserts"), ...recipes(60)];
    entries[0].pageNumber = 20;
    const pages = paginateTocEntries(entries);
    expect(pages.length).toBeGreaterThan(1);
    pages.slice(1).forEach((page) => {
      expect(page[0]).toMatchObject({
        kind: "chapter",
        title: "Desserts",
        pageNumber: 20,
        continued: true,
      });
    });
    // And only at the top — never repeated mid-page.
    expect(pages.flat().filter((entry) => entry.continued)).toHaveLength(pages.length - 1);
  });

  it("only ever repeats a heading over the chapter's own carried-over recipes", () => {
    // Walk the break through a multi-chapter contents: wherever the page falls,
    // a repeat must open its page and be followed by recipes. A repeat sitting
    // above a chapter heading would print that chapter twice in a row; one
    // mid-page would read as a second, separate chapter of the same name.
    for (let lead = 30; lead <= 45; lead += 1) {
      const pages = paginateTocEntries([
        chapter("Starters"),
        ...recipes(lead),
        chapter("Mains"),
        ...recipes(20, 100),
      ]);
      pages.forEach((page) => {
        page.forEach((entry, index) => {
          if (!entry.continued) return;
          expect(index).toBe(0);
          expect(page[1]?.kind).toBe("recipe");
        });
      });
      // A page opening a brand-new chapter opens with the real heading.
      pages.forEach((page) => {
        if (page[0]?.kind === "chapter" && !page[0].continued) {
          expect(page[0].title).toBeTruthy();
        }
      });
    }
  });

  it("fits more lines on a continuation page than on the first, which carries the heading", () => {
    const pages = paginateTocEntries(recipes(120));
    expect(pages[1].length).toBeGreaterThan(pages[0].length);
  });

  it("makes room for the repeated heading rather than pushing a line off the page", () => {
    const withChapter = paginateTocEntries([chapter("Desserts"), ...recipes(200)]);
    const withoutChapter = paginateTocEntries(recipes(200));
    // The continuation pages carry one heading each, so they hold fewer recipe
    // lines than a page of nothing but recipes.
    const recipeLines = (page: ReturnType<typeof paginateTocEntries>[number]) =>
      page.filter((entry) => entry.kind === "recipe").length;
    expect(recipeLines(withChapter[1])).toBeLessThan(recipeLines(withoutChapter[1]));
  });

  it("never strands a chapter heading as the last line of a page", () => {
    // Walk a chapter through every position in a full page: wherever it lands,
    // it must never end up as the final line with its recipes overleaf.
    for (let lead = 20; lead <= 30; lead += 1) {
      const pages = paginateTocEntries([
        ...recipes(lead),
        chapter("Desserts"),
        ...recipes(6, 100),
      ]);
      pages.forEach((page) => {
        expect(page.at(-1)?.kind).not.toBe("chapter");
      });
    }
  });

  it("allows a chapter to be the last line when nothing follows it", () => {
    const pages = paginateTocEntries([...recipes(4), chapter("Empty chapter")]);
    expect(pages).toHaveLength(1);
    expect(pages[0].at(-1)?.kind).toBe("chapter");
  });

  it("gives a wrapping chapter name the room its second line needs", () => {
    const long = chapter("Weeknight dinners for when nobody has time to cook anything");
    const short = chapter("Dinners");
    const withLong = paginateTocEntries(Array.from({ length: 14 }, () => long));
    const withShort = paginateTocEntries(Array.from({ length: 14 }, () => short));
    expect(withLong[0].length).toBeLessThan(withShort[0].length);
  });

  it("returns a single empty page for an empty contents", () => {
    expect(paginateTocEntries([])).toEqual([[]]);
  });
});
