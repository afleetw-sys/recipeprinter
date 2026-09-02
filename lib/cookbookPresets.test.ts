import { describe, expect, it } from "vitest";
import {
  COOKBOOK_PRESETS,
  DEFAULT_COOKBOOK_PRESET_ID,
  LETTER_CARD_HEIGHT_IN,
  LETTER_CARD_WIDTH_IN,
  PRINTERS,
  getCookbookPreset,
  gutterSideForRole,
  presetCardDims,
  presetCardHeightIn,
  presetCardScale,
  presetInsets,
  presetSheetDims,
  presetSheetInches,
} from "@/lib/cookbookPresets";

/**
 * Pure geometry helpers for the cookbook print-format presets. No browser
 * needed — this is the safety net that the scale math never produces a
 * negative/oversized safe area and that the verso/recto gutter alternates the
 * way a bound book needs. The measurement engine is deliberately NOT exercised
 * here: presets only rescale the finished Letter page, they never re-measure.
 */
describe("cookbook presets", () => {
  it("resolves ids, including a stale/undefined id, to a real preset", () => {
    expect(getCookbookPreset("us-letter").id).toBe("us-letter");
    expect(getCookbookPreset("hardcover-8x10").id).toBe("hardcover-8x10");
    // Undefined (older book, no preset saved) falls back to the default.
    expect(getCookbookPreset(undefined).id).toBe(DEFAULT_COOKBOOK_PRESET_ID);
  });

  it("resolves an unknown id to the default rather than failing", () => {
    // The one thing callers rely on: a stale/garbage stored id still yields a
    // real preset, so a book saved against a retired format still exports.
    expect(getCookbookPreset("6x9" as never).id).toBe(DEFAULT_COOKBOOK_PRESET_ID);
  });

  it("every preset points at printers that exist", () => {
    for (const preset of COOKBOOK_PRESETS) {
      expect(preset.printerIds.length).toBeGreaterThan(0);
      for (const id of preset.printerIds) {
        expect(PRINTERS[id]).toBeDefined();
      }
    }
  });

  it("sheet dims are trim + 2·bleed, in CSS px", () => {
    // US Letter: no bleed, so the sheet is exactly the trim.
    expect(presetSheetDims(getCookbookPreset("us-letter"))).toEqual({
      w: 8.5 * 96,
      h: 11 * 96,
    });
    // 8×10 hardcover: 0.125in bleed per edge → 8.25 × 10.25.
    expect(presetSheetDims(getCookbookPreset("hardcover-8x10"))).toEqual({
      w: 8.25 * 96,
      h: 10.25 * 96,
    });
  });

  it("sheet inches are `in` length strings matching the @page size the export pins", () => {
    // These feed `--rp-sheet-w/-h`, which pin the print page box in inches so it
    // matches `@page size` in every engine (never `100vh` — see presetSheetInches).
    expect(presetSheetInches(getCookbookPreset("us-letter"))).toEqual({
      w: "8.5in",
      h: "11in",
    });
    expect(presetSheetInches(getCookbookPreset("hardcover-8x10"))).toEqual({
      w: "8.25in",
      h: "10.25in",
    });
  });

  it("card scale fits inside the safe box and never inverts", () => {
    for (const preset of COOKBOOK_PRESETS) {
      const scale = presetCardScale(preset);
      expect(scale).toBeGreaterThan(0);
      // Scaling text down should never blow the Letter card up.
      expect(scale).toBeLessThanOrEqual(1);

      // The scaled card must fit within the safe box on both axes.
      const safeWidth = preset.trimWidthIn - preset.marginIn * 2 - preset.gutterIn;
      const safeHeight = preset.trimHeightIn - preset.marginIn * 2;
      expect(safeWidth).toBeGreaterThan(0);
      expect(safeHeight).toBeGreaterThan(0);
      expect(scale * LETTER_CARD_WIDTH_IN).toBeLessThanOrEqual(safeWidth + 1e-9);
      expect(scale * LETTER_CARD_HEIGHT_IN).toBeLessThanOrEqual(safeHeight + 1e-9);
    }
  });

  it("spiral has no binding gutter (lies flat); hardcover keeps one (spine)", () => {
    // A coil book lies flat — no spine swallows the inner margin — so its text
    // sits in a uniform, symmetric margin with NO extra gutter.
    expect(getCookbookPreset("us-letter").gutterIn).toBe(0);
    // Case binding does swallow the inner margin, so hardcover keeps a gutter.
    expect(getCookbookPreset("hardcover-8x10").gutterIn).toBeGreaterThan(0);
  });

  it("only the coil format is flagged coilBound (drives the export-only `.rp-coil`)", () => {
    // Spiral is coil-punched → binding decoration thickens at export; hardcover
    // has a spine, no punch → must NOT get the thick inner edge.
    expect(getCookbookPreset("us-letter").coilBound).toBe(true);
    expect(getCookbookPreset("hardcover-8x10").coilBound).toBe(false);
  });

  it("the card IS the sheet, so art bleeds every edge and no text page is cropped", () => {
    // This replaces an art-SCALE assertion. The old model authored every book on
    // a fixed 8.25 × 10.75in Letter card and scaled it onto the sheet, which on
    // hardcover resolved to scale 1.0 on a 10.25in sheet — a card half an inch
    // taller than the page it printed on, silently cut by `overflow: hidden`.
    // Nothing scales now; equality is the whole invariant.
    for (const preset of COOKBOOK_PRESETS) {
      const card = presetCardDims(preset);
      const sheet = presetSheetDims(preset);
      expect(card.w).toBe(sheet.w);
      expect(card.h).toBe(sheet.h);
      expect(presetCardHeightIn(preset)).toBeCloseTo(preset.trimHeightIn + preset.bleedIn * 2, 9);
    }
  });

  it("spiral text margin is symmetric — same inset on the bind edge as the outer edge", () => {
    // With no gutter, the bind inset collapses to the plain margin, so a recipe
    // is centered with equal margins instead of shoved off one side.
    const insets = presetInsets(getCookbookPreset("us-letter"));
    expect(insets.bind).toBe(insets.outer);
    expect(insets.outer).toBe("0.5in");
  });

  it("hardcover insets: margin off outer/block, margin+gutter on the bind edge", () => {
    const hardcover = getCookbookPreset("hardcover-8x10");
    const insets = presetInsets(hardcover);
    // bleed 0.125 + margin 0.5 = 0.625 on outer/block; + gutter 0.5 = 1.125 bind.
    expect(insets.outer).toBe("0.625in");
    expect(insets.block).toBe("0.625in");
    expect(insets.bind).toBe("1.125in");
  });

  it("gutter alternates: verso binds right, recto binds left, single is symmetric", () => {
    expect(gutterSideForRole("left")).toBe("right");
    expect(gutterSideForRole("right")).toBe("left");
    expect(gutterSideForRole("single")).toBe("none");
  });
});
