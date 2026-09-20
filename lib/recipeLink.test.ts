import { describe, expect, it } from "vitest";
import { recipeLinkOn } from "@/lib/recipeLink";
import { recipePagePlacementHasValues } from "@/lib/project";

describe("recipeLinkOn", () => {
  it("follows the book-wide setting when a recipe has no override of its own", () => {
    expect(recipeLinkOn(true, true, undefined)).toBe(true);
    expect(recipeLinkOn(false, true, undefined)).toBe(false);
    expect(recipeLinkOn(false, true, {})).toBe(false);
  });

  it("lets one cookbook recipe show its link while the book has links off", () => {
    expect(recipeLinkOn(false, true, { showSourceUrl: true })).toBe(true);
  });

  it("lets one cookbook recipe hide its link while the book has links on", () => {
    expect(recipeLinkOn(true, true, { showSourceUrl: false })).toBe(false);
  });

  it("ignores overrides outside a cookbook, where there is no per-recipe placement", () => {
    expect(recipeLinkOn(false, false, { showSourceUrl: true })).toBe(false);
    expect(recipeLinkOn(true, false, { showSourceUrl: false })).toBe(true);
  });

  it("counts an explicit false as a value, so autosave does not drop the override", () => {
    expect(recipePagePlacementHasValues({ showSourceUrl: false })).toBe(true);
    expect(recipePagePlacementHasValues({ showSourceUrl: true })).toBe(true);
  });
});
