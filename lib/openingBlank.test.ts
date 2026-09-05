import { describe, expect, it } from "vitest";
import { frontMatterPageCount, needsOpeningBlank, type PageSheet } from "@/lib/usePrintSheets";

/* Sheets, stripped to the two things the rule reads: what kind of page it is,
   and whether it is one half of a facing pair. */
const sheet = (kind: string, layoutKind?: "image" | "section-photo"): PageSheet =>
  ({
    id: kind,
    slots: [{ kind, id: kind } as never],
    backGroupNeeded: false,
    ...(layoutKind ? { layoutKind } : {}),
  }) as PageSheet;

const cover = () => sheet("cover");
const dedication = () => sheet("cover");
const toc = (pages: number) => Array.from({ length: pages }, () => sheet("toc"));
const opener = () => sheet("divider");
const openerPhoto = () => sheet("section-photo", "section-photo");
const photo = () => sheet("image", "image");
const recipe = () => sheet("recipe");

/** A body built from two-page units, which is what the pairing exists for. */
const body = () => [opener(), openerPhoto(), photo(), recipe(), photo(), recipe()];
/** The same book with photos off: nothing faces anything. */
const flatBody = () => [opener(), recipe(), recipe()];

describe("frontMatterPageCount", () => {
  it("counts covers, dedications and every contents page", () => {
    expect(frontMatterPageCount([dedication(), ...toc(2), ...body()])).toBe(3);
  });

  it("stops at the first body page", () => {
    // A cover appearing at the END (a back cover) is not front matter.
    expect(frontMatterPageCount([...toc(1), ...body(), cover()])).toBe(1);
  });

  it("is zero for a book that opens straight onto a chapter", () => {
    expect(frontMatterPageCount(body())).toBe(0);
  });
});

describe("needsOpeningBlank", () => {
  // The whole matrix, stated as a table so a new case is one line. `pages` is
  // the front matter; the body is the same two-page-unit book each time.
  const cases: Array<[string, PageSheet[], boolean]> = [
    ["no front matter at all", [], true],
    ["one contents page", toc(1), false],
    ["two contents pages", toc(2), true],
    ["three contents pages", toc(3), false],
    ["four contents pages", toc(4), true],
    ["dedication only", [dedication()], false],
    ["dedication + one contents page", [dedication(), ...toc(1)], true],
    ["dedication + two contents pages", [dedication(), ...toc(2)], false],
    ["dedication + three contents pages", [dedication(), ...toc(3)], true],
  ];

  for (const [label, front, expected] of cases) {
    it(`${expected ? "pads" : "leaves alone"}: ${label}`, () => {
      expect(needsOpeningBlank([...front, ...body()])).toBe(expected);
    });
  }

  it("padding always lands the body on an even page", () => {
    // The property the table above is really asserting. Whatever the front
    // matter, the first body page must end up even — the left half of a spread.
    for (const [, front] of cases) {
      const sheets = [...front, ...body()];
      const pad = needsOpeningBlank(sheets) ? 1 : 0;
      expect((frontMatterPageCount(sheets) + pad + 1) % 2).toBe(0);
    }
  });

  it("never pads a book with nothing to pair", () => {
    // No facing photos means no spread to break, and a blank leaf is a printed
    // page someone pays for.
    for (const [, front] of cases) {
      expect(needsOpeningBlank([...front, ...flatBody()])).toBe(false);
    }
  });

  it("is stable once padded", () => {
    // Running the rule again on an already-padded book must not add a second
    // leaf, which is what would happen if the blank were not counted as front
    // matter.
    const sheets = [...toc(2), ...body()];
    expect(needsOpeningBlank(sheets)).toBe(true);
    const padded = [sheet("blank"), ...sheets];
    expect(needsOpeningBlank(padded)).toBe(false);
  });
});
