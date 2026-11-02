import { describe, expect, it } from "vitest";
import { deckIndexForPendingSlot, hostedPendingPage, landingForRecipe } from "@/lib/pendingDeckSlot";

// Cover alone, then (1,2), (3,4), (5,6) — sheet indexes, one nav item per sheet.
const navItems = Array.from({ length: 7 }, (_, sheetIndex) => ({ sheetIndex }));
const spreads = [
  { left: null, right: 0 },
  { left: 1, right: 2 },
  { left: 3, right: 4 },
  { left: 5, right: 6 },
];

describe("deckIndexForPendingSlot", () => {
  it("passes the nav index straight through outside a cookbook", () => {
    expect(deckIndexForPendingSlot({ cookbookView: false, slot: 5, navItems, spreads: [] })).toBe(5);
  });

  it("answers in spreads, not nav items, in a cookbook", () => {
    // A recipe added after sheet 3 takes nav slot 4. Written into the deck as
    // 4 it would be the LAST spread; the placeholder is beside sheet 3, whose
    // spread is index 2.
    expect(deckIndexForPendingSlot({ cookbookView: true, slot: 4, navItems, spreads })).toBe(2);
  });

  it("uses the spread of the last page when nothing is anchored", () => {
    expect(deckIndexForPendingSlot({ cookbookView: true, slot: navItems.length, navItems, spreads })).toBe(3);
  });

  it("stays inside the deck however large the nav index is", () => {
    const big = Array.from({ length: 140 }, (_, sheetIndex) => ({ sheetIndex }));
    const bigSpreads = Array.from({ length: 71 }, (_, i) => ({ left: i * 2 - 1, right: i * 2 }));
    const index = deckIndexForPendingSlot({ cookbookView: true, slot: 110, navItems: big, spreads: bigSpreads });
    expect(index).toBeLessThan(bigSpreads.length);
    expect(index).toBe(55);
  });

  it("falls back to the last spread when the page is in no spread, and to 0 when empty", () => {
    expect(deckIndexForPendingSlot({ cookbookView: true, slot: 1, navItems: [{ sheetIndex: 99 }], spreads })).toBe(3);
    expect(deckIndexForPendingSlot({ cookbookView: true, slot: 0, navItems: [], spreads })).toBe(0);
    expect(deckIndexForPendingSlot({ cookbookView: true, slot: 3, navItems, spreads: [] })).toBe(0);
  });
});

describe("landingForRecipe", () => {
  it("selects the just-added recipe's own page, on either side of its spread", () => {
    // Sheets: 0 chapter opener, 1 new recipe facing it, 2 a new recipe on a
    // left-hand page.
    const navItems = [
      { recipeId: "chapter", sheetIndex: 0 },
      { recipeId: "beside-opener", sheetIndex: 1 },
      { recipeId: "on-left", sheetIndex: 2 },
    ];
    const spreads = [
      { left: 0, right: 1 },
      { left: 2, right: null },
    ];
    const land = (recipeId: string) => landingForRecipe({ cookbookView: true, recipeId, navItems, spreads });
    // Left as the spread's default, the opener stayed selected and the new
    // recipe, on the right, was not.
    expect(land("beside-opener")).toEqual({ slide: 0, sheet: 1 });
    expect(land("on-left")).toEqual({ slide: 1, sheet: 2 });
  });
});

describe("hostedPendingPage", () => {
  // A book's pages, by what is on them.
  const recipe = (id: string) => ({ slots: [{ kind: "recipe", recipeId: id }] });
  const opener = (id: string) => ({ slots: [{ kind: "divider", id }] });
  const filler = (id: string) => ({ slots: [{ kind: "blank", id }] });
  const ownBlank = (id: string) => ({ slots: [{ kind: "blank", id, pageId: id }] });
  const toc = { slots: [{ kind: "toc", id: "toc" }] };
  const cover = { slots: [{ kind: "cover", id: "cover" }] };

  it("loads a new recipe on the empty page it is about to fill, wherever that page is", () => {
    // A recipe added while photos sit inside the page fills the next empty
    // page. Its loading card was drawn as a NEW page below the spread instead,
    // and the recipe then landed back up on the empty page, out of view.
    const cases: {
      name: string;
      sheets: { slots: { kind: string; id?: string; recipeId?: string; pageId?: string }[] }[];
      spreads: { left: number | null; right: number | null; single?: boolean }[];
      anchorSheet: number;
      anchorId: string | null;
      expected: { spread: number; side: "left" | "right" };
    }[] = [
      {
        name: "after a recipe on a left page, facing nothing at the end of the book",
        sheets: [cover, opener("s1"), recipe("a")],
        spreads: [{ left: null, right: 0, single: true }, { left: null, right: 1 }, { left: 2, right: null }],
        anchorSheet: 2,
        anchorId: "a",
        expected: { spread: 2, side: "right" },
      },
      {
        name: "after a recipe on a left page, facing a filler blank",
        sheets: [cover, opener("s1"), recipe("a"), filler("gap"), opener("s2")],
        spreads: [{ left: null, right: 0, single: true }, { left: null, right: 1 }, { left: 2, right: 3 }, { left: null, right: 4 }],
        anchorSheet: 2,
        anchorId: "a",
        expected: { spread: 2, side: "right" },
      },
      {
        name: "after a recipe on a right page, with the next spread opening on a filler blank",
        sheets: [cover, opener("s1"), recipe("a"), recipe("b"), filler("gap"), opener("s2")],
        spreads: [{ left: null, right: 0, single: true }, { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: 5 }],
        anchorSheet: 3,
        anchorId: "b",
        expected: { spread: 3, side: "left" },
      },
      {
        name: "after a recipe two pages long, from the page it ends on",
        sheets: [cover, opener("s1"), recipe("a"), recipe("a"), filler("gap"), opener("s2")],
        spreads: [{ left: null, right: 0, single: true }, { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: 5 }],
        anchorSheet: 2,
        anchorId: "a",
        expected: { spread: 3, side: "left" },
      },
      {
        name: "at the top of a chapter whose opener faces a filler blank",
        sheets: [cover, opener("s1"), filler("gap")],
        spreads: [{ left: null, right: 0, single: true }, { left: 1, right: 2 }],
        anchorSheet: 1,
        anchorId: "s1",
        expected: { spread: 1, side: "right" },
      },
    ];
    for (const { name, expected, ...input } of cases) {
      expect(hostedPendingPage({ ...input, fullPagePhotos: false }), name).toEqual(expected);
    }
  });

  it("adds a page instead when no empty page is next", () => {
    const sheets = [cover, toc, recipe("a"), recipe("b"), ownBlank("mine")];
    const spreads = [{ left: null, right: 0, single: true }, { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: null }];
    // A real page follows.
    expect(hostedPendingPage({ sheets, spreads, anchorSheet: 2, anchorId: "a", fullPagePhotos: false })).toBeNull();
    // A blank page the cook added is theirs, not room.
    expect(hostedPendingPage({ sheets, spreads, anchorSheet: 3, anchorId: "b", fullPagePhotos: false })).toBeNull();
    // Nothing goes beside the contents.
    expect(
      hostedPendingPage({
        sheets: [cover, toc],
        spreads: [{ left: null, right: 0, single: true }, { left: 1, right: null }],
        anchorSheet: 1,
        anchorId: "toc",
        fullPagePhotos: false,
      }),
    ).toBeNull();
    // A recipe on its own full-page photo spread opens a new spread.
    expect(
      hostedPendingPage({
        sheets: [cover, opener("s1"), recipe("a")],
        spreads: [{ left: null, right: 0, single: true }, { left: null, right: 1 }, { left: 2, right: null }],
        anchorSheet: 2,
        anchorId: "a",
        fullPagePhotos: true,
      }),
    ).toBeNull();
  });
});
