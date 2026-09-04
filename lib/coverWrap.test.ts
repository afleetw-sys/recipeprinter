import { describe, expect, it } from "vitest";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import {
  DEFAULT_COVER_WRAP_SPEC,
  coverWrapGeometry,
  spineFitsTitle,
  spineWidthIn,
  wrapSpecFor,
  type CoverWrapSpec,
} from "@/lib/coverWrap";

const hardcover = getCookbookPreset("hardcover-8x10");
const coil = getCookbookPreset("coil-us-letter");

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

describe("wrapSpecFor", () => {
  it("gives a case wrap its fold-over allowance and its boards", () => {
    expect(wrapSpecFor(hardcover)).toEqual(DEFAULT_COVER_WRAP_SPEC);
  });

  it("gives a flat wrap the preset's own bleed, and no boards at all", () => {
    // A coil cover is printed flat and trimmed: the extra material is bleed,
    // which belongs to the preset, not a binding constant. And there are no
    // boards for the spine to carry.
    const spec = wrapSpecFor(coil);
    expect(spec.wrapAllowanceIn).toBe(coil.bleedIn);
    expect(spec.boardAllowanceIn).toBe(0);
  });

  it("is what stops a coil cover being built to hardcover numbers", () => {
    // The failure this prevents is not cosmetic: a print service measures the
    // sheet before it will accept the file, and rejects one that does not match.
    const flat = coverWrapGeometry(coil, 64);
    const asCase = coverWrapGeometry(coil, 64, DEFAULT_COVER_WRAP_SPEC);
    // Height is over by the fold-over allowance that a flat cover does not
    // have: 2 x (0.75 - 0.125).
    expect(asCase.sheetHeightIn - flat.sheetHeightIn).toBeCloseTo(1.25, 6);
    // Width is over by that AND by the boards, which a coil book has none of.
    expect(asCase.sheetWidthIn - flat.sheetWidthIn).toBeCloseTo(1.25 + 0.125, 6);
  });
});

describe("coverWrapGeometry — flat (coil / paperback)", () => {
  it("is trim doubled, plus the spine, plus a bleed on each edge", () => {
    const g = coverWrapGeometry(coil, 64);
    // 64 pages = 32 sheets * 0.0042 = 0.1344in of paper, and no boards.
    expect(g.spineWidthIn).toBeCloseTo(0.1344, 6);
    expect(g.sheetWidthIn).toBeCloseTo(8.5 * 2 + 0.1344 + 0.125 * 2, 6);
    expect(g.sheetHeightIn).toBeCloseTo(11 + 0.125 * 2, 6);
    // Lulu's stated shape for a cover: "typically around double the width of
    // your book size".
    expect(g.sheetWidthIn).toBeGreaterThan(coil.trimWidthIn * 2);
  });

  it("panels stay at trim, so the trim box lands where the printer expects", () => {
    const g = coverWrapGeometry(coil, 64);
    expect(g.panelWidthIn).toBe(8.5);
    expect(g.panelHeightIn).toBe(11);
    expect(g.frontPanelOffsetIn).toBeCloseTo(0.125 + 8.5 + g.spineWidthIn, 6);
  });

  it("tiles the sheet exactly at any page count", () => {
    for (const pages of [8, 33, 120, 400]) {
      const g = coverWrapGeometry(coil, pages);
      expect(g.wrapAllowanceIn * 2 + g.panelWidthIn * 2 + g.spineWidthIn).toBeCloseTo(
        g.sheetWidthIn,
        6,
      );
      expect(g.frontPanelOffsetIn + g.panelWidthIn + g.wrapAllowanceIn).toBeCloseTo(
        g.sheetWidthIn,
        6,
      );
    }
  });
});
