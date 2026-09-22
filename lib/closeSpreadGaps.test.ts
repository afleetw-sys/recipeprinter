import { describe, expect, it } from "vitest";
import { closeSpreadGaps, type PageSheet } from "@/lib/usePrintSheets";

/* Sheets, stripped to the two things assembleSpreads reads: what kind of
   page it is, and whether it is one half of a facing pair. Mirrors
   openingBlank.test.ts's own fixture builder. */
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

  it("inserts a real blank when a lone recipe precedes a facing-photo spread", () => {
    // The reported bug: a single recipe, then an image-spread pair — the
    // preview orphans the recipe (an empty box on the right) to keep the
    // photo beside its own recipe instead.
    const sheets = [recipe(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["recipe", "blank", "image", "recipe"]);
  });

  it("does the same for a chapter opener before its own facing art", () => {
    const sheets = [recipe(), opener(), openerPhoto()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["recipe", "blank", "divider", "section-photo"]);
  });

  it("leaves the book alone when an even run already precedes the photo", () => {
    const sheets = [recipe(), recipe(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(sheets).toHaveLength(4);
  });

  it("never pads the book's true last page — a lone trailing page is not a gap", () => {
    const sheets = [photo(), recipe(), recipe()];
    closeSpreadGaps(sheets);
    // The photo pairs with the first recipe; the second recipe ends the book
    // alone. That's a real, correct ending, not a gap to close.
    expect(sheets).toHaveLength(3);
  });

  it("closes a gap made by an odd-length contents block too", () => {
    // Three contents pages pair as (toc,toc) then a lone third — orphaned to
    // keep the photo spread that follows intact.
    const sheets = [toc(), toc(), toc(), photo(), recipe()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual(["toc", "toc", "toc", "blank", "image", "recipe"]);
  });

  it("closes more than one gap in the same book", () => {
    const sheets = [recipe(), photo(), recipe(), recipe(), opener(), openerPhoto()];
    closeSpreadGaps(sheets);
    expect(kinds(sheets)).toEqual([
      "recipe",
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
