import { describe, expect, it } from "vitest";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import {
  DEFAULT_COVER_WRAP_SPEC,
  coverWrapGeometry,
  coverWrapGeometryFromSheet,
  LULU_CASEWRAP_SPEC,
  spineFitsTitle,
  wrapGeometryForSpine,
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
  overhangHIn: 0,
  overhangVIn: 0,
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

describe("coverWrapGeometryFromSheet", () => {
  // The exact figures Lulu quoted for a US Letter hardcover, which our own
  // geometry missed by nearly two inches because it was deriving a coil wrap
  // from a generic paper caliper.
  const LULU_US_LETTER_HARDCOVER = { widthIn: 19.25, heightIn: 12.75, spineWidthIn: 0.5 };
  const letter = getCookbookPreset("coil-us-letter");

  it("reproduces the printer's sheet exactly", () => {
    const g = coverWrapGeometryFromSheet(letter, LULU_US_LETTER_HARDCOVER);
    expect(g.sheetWidthIn).toBe(19.25);
    expect(g.sheetHeightIn).toBe(12.75);
    expect(g.spineWidthIn).toBe(0.5);
  });

  it("derives the allowance by subtraction, not from our own constants", () => {
    const g = coverWrapGeometryFromSheet(letter, LULU_US_LETTER_HARDCOVER);
    // (19.25 - 8.5 - 8.5 - 0.5) / 2 and (12.75 - 11) / 2 both land on 0.875,
    // which is Lulu's casewrap fold-over. Nothing here knows that number.
    expect(g.wrapAllowanceIn).toBeCloseTo(0.875, 6);
    expect(g.wrapAllowanceYIn).toBeCloseTo(0.875, 6);
  });

  it("keeps the panels at the book's trim, so the cover agrees with the pages", () => {
    const g = coverWrapGeometryFromSheet(letter, LULU_US_LETTER_HARDCOVER);
    expect(g.panelWidthIn).toBe(letter.trimWidthIn);
    expect(g.panelHeightIn).toBe(letter.trimHeightIn);
    expect(g.frontPanelOffsetIn).toBeCloseTo(0.875 + 8.5 + 0.5, 6);
  });

  it("tiles the quoted sheet exactly", () => {
    for (const sheet of [
      LULU_US_LETTER_HARDCOVER,
      { widthIn: 17.25, heightIn: 11.25, spineWidthIn: 0 },
      { widthIn: 18.4, heightIn: 11.6, spineWidthIn: 0.32 },
    ]) {
      const g = coverWrapGeometryFromSheet(letter, sheet);
      expect(g.wrapAllowanceIn * 2 + g.panelWidthIn * 2 + g.spineWidthIn).toBeCloseTo(
        g.sheetWidthIn,
        6,
      );
      expect(g.wrapAllowanceYIn * 2 + g.panelHeightIn).toBeCloseTo(g.sheetHeightIn, 6);
    }
  });

  it("floors the allowance at zero rather than overlapping the panels", () => {
    // A sheet too small to hold two trim panels is a typo. Negative padding
    // would quietly slide the panels over each other instead of showing it.
    const g = coverWrapGeometryFromSheet(letter, {
      widthIn: 10,
      heightIn: 6,
      spineWidthIn: 0,
    });
    expect(g.wrapAllowanceIn).toBe(0);
    expect(g.wrapAllowanceYIn).toBe(0);
  });
});

describe("LULU_CASEWRAP_SPEC", () => {
  const letter = getCookbookPreset("coil-us-letter");

  it("reproduces the sheet Lulu quoted for a US Letter cookbook", () => {
    // This is the whole justification for the constant. Lulu asked for
    // 19.25 x 12.75 at a 0.5in spine; their published anatomy is a 0.75in wrap
    // plus a 0.125in horizontal and 0.25in vertical board overhang. If those
    // three numbers ever stop producing that sheet, one of them has changed.
    const g = wrapGeometryForSpine(letter, 0.5, LULU_CASEWRAP_SPEC);
    expect(g.sheetWidthIn).toBeCloseTo(19.25, 6);
    expect(g.sheetHeightIn).toBeCloseTo(12.75, 6);
  });

  it("makes the panel the board, which stands proud of the pages", () => {
    const g = wrapGeometryForSpine(letter, 0.5, LULU_CASEWRAP_SPEC);
    // "There is no overhang on the spine side", so the width gains it once.
    expect(g.panelWidthIn).toBeCloseTo(8.625, 6);
    expect(g.panelHeightIn).toBeCloseTo(11.25, 6);
  });

  it("agrees with reading the same sheet back off a printer's quote", () => {
    // Deriving forwards from the spine and backwards from a stated sheet must
    // put the spine in the same place, or the two paths would disagree about
    // where the front cover starts.
    const forward = wrapGeometryForSpine(letter, 0.5, LULU_CASEWRAP_SPEC);
    const backward = coverWrapGeometryFromSheet(letter, {
      widthIn: 19.25,
      heightIn: 12.75,
      spineWidthIn: 0.5,
    });
    expect(backward.frontPanelOffsetIn).toBeCloseTo(forward.frontPanelOffsetIn, 6);
    expect(backward.spineWidthIn).toBe(forward.spineWidthIn);
  });
});

describe("wrapGeometryForSpine", () => {
  it("leaves a flat cover flush with its pages", () => {
    const coil = getCookbookPreset("coil-us-letter");
    const g = wrapGeometryForSpine(coil, 0.2);
    expect(g.panelWidthIn).toBe(coil.trimWidthIn);
    expect(g.panelHeightIn).toBe(coil.trimHeightIn);
    expect(g.sheetWidthIn).toBeCloseTo(8.5 * 2 + 0.2 + 0.25, 6);
  });

  it("never returns a negative spine", () => {
    expect(wrapGeometryForSpine(getCookbookPreset("coil-us-letter"), -3).spineWidthIn).toBe(0);
  });
});
