import { describe, expect, it } from "vitest";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import {
  DEFAULT_COVER_WRAP_SPEC,
  coverWrapGeometry,
  spineFitsTitle,
  spineWidthIn,
  type CoverWrapSpec,
} from "@/lib/coverWrap";

const hardcover = getCookbookPreset("hardcover-8x10");

/** A deliberately round spec, so expected values can be checked by hand. */
const ROUND: CoverWrapSpec = {
  paperCaliperIn: 0.005,
  wrapAllowanceIn: 0.75,
  boardAllowanceIn: 0.125,
};

describe("spineWidthIn", () => {
  it("counts two pages to a sheet, then adds the boards", () => {
    // 100 pages = 50 sheets * 0.005 = 0.25in of paper, + 0.125 boards.
    expect(spineWidthIn(100, ROUND)).toBeCloseTo(0.375, 6);
  });

  it("rounds an odd page count up to a whole sheet", () => {
    // A book cannot contain half a leaf — the binder adds a blank, and the
    // spine is thicker for it. Rounding down would pull the art off-centre.
    expect(spineWidthIn(101, ROUND)).toBe(spineWidthIn(102, ROUND));
    expect(spineWidthIn(101, ROUND)).toBeGreaterThan(spineWidthIn(100, ROUND));
  });

  it("is still board thickness at zero pages, and never negative", () => {
    expect(spineWidthIn(0, ROUND)).toBeCloseTo(0.125, 6);
    expect(spineWidthIn(-10, ROUND)).toBeCloseTo(0.125, 6);
  });

  it("grows monotonically with page count", () => {
    const widths = [20, 60, 120, 300].map((n) => spineWidthIn(n, ROUND));
    const sorted = [...widths].sort((a, b) => a - b);
    expect(widths).toEqual(sorted);
  });
});

describe("coverWrapGeometry", () => {
  it("lays out back + spine + front, with wrap on every edge", () => {
    const g = coverWrapGeometry(hardcover, 100, ROUND);
    // 8 + 8 trim, 0.375 spine, 0.75 wrap on each side.
    expect(g.sheetWidthIn).toBeCloseTo(8 + 8 + 0.375 + 1.5, 6);
    // Height takes wrap top and bottom only — a wrap has no separate bleed.
    expect(g.sheetHeightIn).toBeCloseTo(10 + 1.5, 6);
    expect(g.panelWidthIn).toBe(8);
    expect(g.panelHeightIn).toBe(10);
  });

  it("puts the front panel past the wrap, the back panel, and the spine", () => {
    const g = coverWrapGeometry(hardcover, 100, ROUND);
    expect(g.frontPanelOffsetIn).toBeCloseTo(0.75 + 8 + 0.375, 6);
    // And the front panel must end exactly at the far wrap allowance.
    expect(g.frontPanelOffsetIn + g.panelWidthIn + g.wrapAllowanceIn).toBeCloseTo(
      g.sheetWidthIn,
      6,
    );
  });

  it("keeps the panels and spine accounted for across the whole sheet", () => {
    // The three panels plus both wraps must tile the sheet exactly, at any
    // page count — this is the invariant a mis-derived spine would break.
    for (const pages of [24, 87, 150, 402]) {
      const g = coverWrapGeometry(hardcover, pages, DEFAULT_COVER_WRAP_SPEC);
      expect(g.wrapAllowanceIn * 2 + g.panelWidthIn * 2 + g.spineWidthIn).toBeCloseTo(
        g.sheetWidthIn,
        6,
      );
    }
  });

  it("widens only the sheet and the spine as the book grows", () => {
    const thin = coverWrapGeometry(hardcover, 40, ROUND);
    const fat = coverWrapGeometry(hardcover, 400, ROUND);
    expect(fat.spineWidthIn).toBeGreaterThan(thin.spineWidthIn);
    expect(fat.sheetWidthIn).toBeGreaterThan(thin.sheetWidthIn);
    // Trim doesn't change — only the block between the panels does.
    expect(fat.panelWidthIn).toBe(thin.panelWidthIn);
    expect(fat.sheetHeightIn).toBeCloseTo(thin.sheetHeightIn, 6);
  });
});

describe("spineFitsTitle", () => {
  it("refuses a spine too narrow to carry legible type", () => {
    // A short book: 40 pages of thin stock is a sliver.
    expect(spineFitsTitle(spineWidthIn(40, ROUND))).toBe(false);
    // A substantial one clears the bar.
    expect(spineFitsTitle(spineWidthIn(300, ROUND))).toBe(true);
  });
});
