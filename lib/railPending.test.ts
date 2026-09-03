import { describe, expect, it } from "vitest";
import { pendingAnchorIndex, sectionDrawsNestingLine } from "./railPending";

type Row = { recipeId?: string | null; sectionId?: string | null };
const anchor = (rows: Row[], afterRecipeId: string | null, sectionId: string | null) =>
  pendingAnchorIndex(rows, {
    afterRecipeId,
    sectionId,
    recipeIdOf: (r) => r.recipeId,
    sectionIdOf: (r) => r.sectionId,
  });

describe("pendingAnchorIndex", () => {
  const rows: Row[] = [
    { recipeId: null, sectionId: "breakfast" }, // chapter opener
    { recipeId: "r1", sectionId: "breakfast" },
    { recipeId: "r2", sectionId: "breakfast" }, // r2 page 1
    { recipeId: "r2", sectionId: "breakfast" }, // r2 page 2
    { recipeId: null, sectionId: "dinner" }, // chapter opener
  ];

  it("anchors under the LAST row of a multi-page recipe", () => {
    expect(anchor(rows, "r2", "breakfast")).toBe(3);
  });

  it("anchors under a single-page recipe", () => {
    expect(anchor(rows, "r1", "breakfast")).toBe(1);
  });

  it("falls back to the target section when there is no recipe to sit after", () => {
    // The first recipe going into Dinner: nothing to follow, so it follows the
    // chapter opener rather than dropping to the bottom of the rail.
    expect(anchor(rows, null, "dinner")).toBe(4);
  });

  it("uses the LAST row of the target section, not the first", () => {
    expect(anchor(rows, null, "breakfast")).toBe(3);
  });

  it("reports no anchor when the import targets nothing", () => {
    expect(anchor(rows, null, null)).toBe(-1);
  });

  it("reports no anchor when the target section has no rows yet", () => {
    expect(anchor(rows, null, "dessert")).toBe(-1);
  });
});

describe("sectionDrawsNestingLine", () => {
  const sections = [
    { id: "breakfast", title: "Breakfast" },
    { id: "untitled", title: "  " },
    { id: "placeholder", title: "Section" },
  ];
  const titleForId = (id: string) => sections.find((s) => s.id === id)?.title ?? "section";

  it("draws for a real named chapter", () => {
    expect(sectionDrawsNestingLine("breakfast", sections, titleForId)).toBe(true);
  });

  it("does not draw for an untitled section", () => {
    expect(sectionDrawsNestingLine("untitled", sections, titleForId)).toBe(false);
  });

  it("does not draw when there is no target section", () => {
    expect(sectionDrawsNestingLine(null, sections, titleForId)).toBe(false);
  });

  it("does not draw for the placeholder title the rail treats as unnamed", () => {
    expect(sectionDrawsNestingLine("placeholder", sections, () => "section")).toBe(false);
  });
});
