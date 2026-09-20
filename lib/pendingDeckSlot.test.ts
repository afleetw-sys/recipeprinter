import { describe, expect, it } from "vitest";
import { deckIndexForPendingSlot } from "@/lib/pendingDeckSlot";

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
