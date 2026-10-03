// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { PREVIEW_MIN_WIDTH, RAIL_MIN_WIDTH, clampRailWidth, readRailWidths, writeRailWidths } from "./railWidth";

const room = { shellWidth: 1440, panelWidth: 330 };

describe("clampRailWidth", () => {
  it.each(["pages", "organize"] as const)("keeps the %s rail above its minimum", (mode) => {
    expect(clampRailWidth(10, mode, room)).toBe(RAIL_MIN_WIDTH[mode]);
  });

  it("never squeezes the preview below its minimum", () => {
    expect(clampRailWidth(5000, "organize", room)).toBe(1440 - 330 - PREVIEW_MIN_WIDTH);
  });

  it("gives the rail the settings panel's room when that panel is folded", () => {
    expect(clampRailWidth(5000, "pages", { shellWidth: 1440, panelWidth: 0 })).toBe(1440 - PREVIEW_MIN_WIDTH);
  });

  it("holds the minimum on a window too small for both", () => {
    expect(clampRailWidth(400, "organize", { shellWidth: 700, panelWidth: 330 })).toBe(RAIL_MIN_WIDTH.organize);
  });

  it("passes a width in bounds through, rounded", () => {
    expect(clampRailWidth(401.6, "pages", room)).toBe(402);
  });
});

describe("rail width storage", () => {
  afterEach(() => window.localStorage.clear());

  it("remembers each mode's width separately", () => {
    writeRailWidths({ pages: 260, organize: 600 });
    expect(readRailWidths()).toEqual({ pages: 260, organize: 600 });
  });

  it("drops anything that is not a usable width", () => {
    window.localStorage.setItem("rp.railWidths.v1", JSON.stringify({ pages: "wide", organize: -3 }));
    expect(readRailWidths()).toEqual({});
    window.localStorage.setItem("rp.railWidths.v1", "not json");
    expect(readRailWidths()).toEqual({});
  });
});
