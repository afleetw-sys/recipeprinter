import { describe, expect, it } from "vitest";
import {
  COOKBOOK_FORMATS,
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

describe("print-service presets", () => {
  it("the coil print-service preset is the home one plus bleed on every edge", () => {
    const home = getCookbookPreset("us-letter");
    const service = getCookbookPreset("coil-us-letter");
    // Same book, same trim, same lie-flat margins. The only difference is the
    // sheet it is drawn on.
    expect(service.trimWidthIn).toBe(home.trimWidthIn);
    expect(service.trimHeightIn).toBe(home.trimHeightIn);
    expect(service.marginIn).toBe(home.marginIn);
    expect(service.gutterIn).toBe(home.gutterIn);
    expect(home.bleedIn).toBe(0);
    expect(service.bleedIn).toBe(0.125);
    // Lulu sizes a book by measuring the file: 8.5x11 trim full bleed is
    // 8.75x11.25, exactly as their own worked example describes.
    expect(presetSheetInches(service)).toEqual({ w: "8.75in", h: "11.25in" });
  });

  it("every format bound by a print service ships its cover as a separate wrap", () => {
    // "Your cover should be completely separate from your interior file."
    // The home-printed format is the only one that keeps the cover inside.
    for (const preset of COOKBOOK_PRESETS) {
      const separate = preset.id !== "us-letter";
      expect(preset.wrapRequired).toBe(separate);
    }
  });

  it("a wrap style is declared wherever a wrap is produced", () => {
    for (const preset of COOKBOOK_PRESETS.filter((p) => p.wrapRequired)) {
      expect(["case", "flat"]).toContain(preset.wrapStyle);
    }
    // Coil is printed flat and trimmed; only a hardcover folds around boards.
    expect(getCookbookPreset("coil-us-letter").wrapStyle).toBe("flat");
    expect(getCookbookPreset("hardcover-8x10").wrapStyle).toBe("case");
  });

  it("never sends a bundled-cover file to a service that wants them separate", () => {
    // Lulu refuses a cover bound into the interior, so it must not be offered
    // for a format that bundles one. This is the mistake the "sending this to a
    // print shop" checkbox encoded: it treated every print shop as wanting the
    // same thing, when the only real split is whether the cover travels on its
    // own. Staples takes the single file; Lulu does not.
    const wantsSeparateCovers = ["lulu", "blurb"];
    for (const preset of COOKBOOK_PRESETS.filter((p) => !p.wrapRequired)) {
      for (const printer of wantsSeparateCovers) {
        expect(preset.printerIds).not.toContain(printer);
      }
    }
  });

  it("never recommends a printer that cannot make the format", () => {
    // Each of these is a real limit of a real shop, and each one had us
    // recommending a printer that would have refused the file:
    //   Blurb binds softcover, hardcover and layflat, and no coil at all.
    //   Lulu's trim list has no 8 x 10 in it (7 x 10 and 8.5 x 11 are the
    //     neighbours), so its hardcover has to be the US Letter one.
    //   Staples binds documents and booklets, not case wraps.
    for (const preset of COOKBOOK_PRESETS) {
      expect(preset.printerIds.length).toBeGreaterThan(0);
      if (preset.coilBound) expect(preset.printerIds).not.toContain("blurb");
      if (preset.wrapStyle === "case") expect(preset.printerIds).not.toContain("staples");
      if (preset.trimWidthIn === 8 && preset.trimHeightIn === 10) {
        expect(preset.printerIds).not.toContain("lulu");
      }
    }
  });

  it("gives a cased book a gutter and a lie-flat one none", () => {
    // A cased spine swallows the inner margin; a coil book opens flat, so a
    // gutter there would just shove every page off-centre.
    for (const preset of COOKBOOK_PRESETS) {
      if (preset.coilBound) expect(preset.gutterIn).toBe(0);
      else expect(preset.gutterIn).toBeGreaterThan(0);
    }
  });

  it("builds a wrap from the printer's own anatomy where we have it", () => {
    // Lulu publishes its casewrap numbers and they reproduce the sheet Lulu
    // quotes; nothing else does, so nothing else claims to.
    expect(getCookbookPreset("hardcover-us-letter").wrapSpecId).toBe("lulu-casewrap");
    // The coil book goes to Lulu too, and they quote it the same sheet.
    expect(getCookbookPreset("coil-us-letter").wrapSpecId).toBe("lulu-coil");
    // Blurb publishes nothing we have verified, so nothing is claimed for it.
    expect(getCookbookPreset("hardcover-8x10").wrapSpecId).toBeUndefined();
  });
});

describe("COOKBOOK_FORMATS", () => {
  it("offers two kinds of book, with sizes inside them", () => {
    // The print-service sheet is the same book as the spiral one: same trim,
    // same margins, same pages. Listing it as a third format asked people to
    // choose between two things that are not different.
    // Two cards, because "what kind of book is this" is the only question that
    // belongs at the top. Size lives inside the kind it belongs to.
    expect(COOKBOOK_FORMATS.map((format) => format.id)).toEqual(["spiral", "hardcover"]);
    expect(COOKBOOK_FORMATS.map((format) => format.presetIds)).toEqual([
      ["us-letter"],
      ["hardcover-us-letter", "hardcover-8x10"],
    ]);
  });

  it("keeps every variant reachable from the format that owns it", () => {
    // Nothing renderable may be orphaned: a preset is either offered as a
    // format or reached through one, never neither.
    const offered = new Set(COOKBOOK_FORMATS.flatMap((format) => format.presetIds));
    for (const preset of COOKBOOK_PRESETS) {
      const reachable = COOKBOOK_PRESETS.some(
        (other) => other.printServicePresetId === preset.id,
      );
      expect(offered.has(preset.id) || reachable).toBe(true);
    }
  });

  it("only offers the choice where there is one to make", () => {
    // A hardcover cannot be made at home, so it has no home-printing variant to
    // toggle between and shows no option.
    expect(getCookbookPreset("us-letter").printServicePresetId).toBe("coil-us-letter");
    expect(getCookbookPreset("hardcover-8x10").printServicePresetId).toBeUndefined();
  });

  it("a format and its print-service variant are the same book", () => {
    const home = getCookbookPreset("us-letter");
    const service = getCookbookPreset(home.printServicePresetId);
    expect(service.productName).toBe(home.productName);
    expect(service.trimLabel).toBe(home.trimLabel);
    // What differs is only where it is going: the sheet it is drawn on, and
    // whether the cover travels as its own file.
    expect(service.bleedIn).toBeGreaterThan(home.bleedIn);
    expect(service.wrapRequired).toBe(true);
    expect(home.wrapRequired).toBe(false);
  });
});

  it("never names a preset that does not exist", () => {
    // A typo here would render a card whose Save button exports the default
    // preset instead of the one it says, which is a wrong book rather than an
    // error.
    const known = new Set(COOKBOOK_PRESETS.map((preset) => preset.id));
    for (const format of COOKBOOK_FORMATS) {
      expect(format.presetIds.length).toBeGreaterThan(0);
      for (const id of format.presetIds) expect(known.has(id)).toBe(true);
    }
  });
