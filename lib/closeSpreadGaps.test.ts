import { describe, expect, it } from "vitest";
import { blankPageReason, closeSpreadGaps, type PageSheet } from "@/lib/usePrintSheets";

/* Sheets, stripped to the two things assembleSpreads reads: what kind of
   page it is, and whether it is one half of a facing pair. No cover in front,
   so the first sheet is page 1: a right-hand page, alone. */
const sheet = (kind: string, layoutKind?: "image" | "section-photo"): PageSheet =>
  ({
    id: kind,
    slots: [{ kind, id: kind } as never],
    backGroupNeeded: false,
    ...(layoutKind ? { layoutKind } : {}),
  }) as PageSheet;

const recipe = () => sheet("recipe");
const photo = () => sheet("image", "image");
const opener = () => sheet("divider");
const openerPhoto = () => sheet("section-photo", "section-photo");
const toc = () => sheet("toc");
const dedication = (): PageSheet =>
  ({
    id: "dedication",
    slots: [{ kind: "cover", id: "dedication", cover: {}, side: "dedication" } as never],
    backGroupNeeded: false,
  }) as PageSheet;

const kinds = (sheets: PageSheet[]) => sheets.map((s) => s.slots[0]?.kind ?? "blank");

describe("closeSpreadGaps", () => {
  it("does nothing to a book with no facing pairs at all", () => {
    const sheets = [recipe(), recipe(), recipe()];
    closeSpreadGaps(sheets);
    expect(sheets).toHaveLength(3);
  });

  it("does not add a blank after an opening dedication", () => {
    const sheets = [dedication(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["cover", "image", "recipe"]);
  });

  it("needs no blank when page 1 stands alone before a facing-photo spread", () => {
    const sheets = [recipe(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["recipe", "image", "recipe"]);
  });

  it("inserts a real blank when a lone recipe precedes a facing-photo spread", () => {
    // Page 2 is a left-hand page with a photo/recipe pair after it; the
    // preview orphans it (an empty box on the right) to keep the photo beside
    // its own recipe.
    const sheets = [recipe(), recipe(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["recipe", "recipe", "blank", "image", "recipe"]);
  });

  it("does the same for a chapter opener before its own facing art", () => {
    const sheets = [recipe(), recipe(), opener(), openerPhoto()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["recipe", "recipe", "blank", "divider", "section-photo"]);
  });

  it("prints page 1 blank rather than split a photo from its recipe", () => {
    const sheets = [photo(), recipe(), recipe()];
    closeSpreadGaps(sheets);
    // The second recipe ends the book alone: a real ending, not a gap.
    expect(kinds(sheets)).toEqual(["blank", "image", "recipe", "recipe"]);
  });

  it("prints page 1 blank rather than split a chapter opener from its art", () => {
    const sheets = [opener(), openerPhoto(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["blank", "divider", "section-photo", "recipe"]);
  });

  it("stands the first of two contents pages alone and gives the second its own spread", () => {
    const sheets = [toc(), toc(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["toc", "toc", "blank", "image", "recipe"]);
  });

  it("leaves a three-page contents alone: page 1, then a spread", () => {
    const sheets = [toc(), toc(), toc(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(sheets).toHaveLength(5);
  });

  it("closes more than one gap in the same book", () => {
    const sheets = [photo(), recipe(), recipe(), opener(), openerPhoto()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual([
      "blank",
      "image",
      "recipe",
      "recipe",
      "blank",
      "divider",
      "section-photo",
    ]);
  });
});

describe("blankPageReason", () => {
  const blankIndex = (sheets: PageSheet[]) => kinds(sheets).indexOf("blank");

  it("explains a blank that keeps a photo beside its recipe", () => {
    const sheets = [photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(blankPageReason(sheets, blankIndex(sheets))).toMatch(/photo sits beside its recipe/);
  });

  it("explains a blank that keeps a chapter opener beside its art", () => {
    const sheets = [recipe(), recipe(), opener(), openerPhoto()];
    closeSpreadGaps(sheets);
    expect(blankPageReason(sheets, blankIndex(sheets))).toMatch(/chapter sits beside its photo/);
  });

  it("explains a blank that keeps the recipes off the contents' last opening", () => {
    const sheets = [toc(), toc(), opener(), recipe()];
    closeSpreadGaps(sheets);
    expect(blankPageReason(sheets, blankIndex(sheets))).toMatch(/recipes start after a page turn/);
  });
});
