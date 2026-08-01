import { describe, expect, it } from "vitest";
import {
  COOKBOOK_PRESETS,
  DEFAULT_COOKBOOK_PRESET_ID,
  LETTER_CARD_HEIGHT_IN,
  LETTER_CARD_WIDTH_IN,
  PRINTERS,
  getCookbookPreset,
  gutterSideForRole,
  isCookbookPresetId,
  presetArtScale,
  presetCardScale,
  presetInsets,
  presetSheetDims,
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

  it("recognizes only known preset ids", () => {
    expect(isCookbookPresetId("us-letter")).toBe(true);
    expect(isCookbookPresetId("hardcover-8x10")).toBe(true);
    expect(isCookbookPresetId("6x9")).toBe(false);
    expect(isCookbookPresetId(null)).toBe(false);
    expect(isCookbookPresetId(undefined)).toBe(false);
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

  it("art scale fills (covers) the whole sheet so artwork bleeds", () => {
    for (const preset of COOKBOOK_PRESETS) {
      const scale = presetArtScale(preset);
      const sheetWidth = preset.trimWidthIn + preset.bleedIn * 2;
      const sheetHeight = preset.trimHeightIn + preset.bleedIn * 2;
      // Covers both axes: scaled card is at least as large as the sheet.
      expect(scale * LETTER_CARD_WIDTH_IN).toBeGreaterThanOrEqual(sheetWidth - 1e-9);
      expect(scale * LETTER_CARD_HEIGHT_IN).toBeGreaterThanOrEqual(sheetHeight - 1e-9);
    }
  });

  it("insets equal margin off the outer/block edges and margin+gutter on the bind edge", () => {
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
