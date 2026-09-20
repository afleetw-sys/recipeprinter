import { describe, expect, it } from "vitest";
import { addRecipeTarget } from "@/lib/addRecipeTarget";
import type { NavItem } from "@/lib/usePrintSheets";

const nav = (kind: NavItem["kind"], recipeId: string): NavItem => ({
  kind,
  recipeId,
  sheetIndex: 0,
  slotIndex: 0,
  label: "",
  pageLabel: "",
  flip: false,
});

const sections = [
  { id: "s1", items: [{ id: "a" }, { id: "b" }] },
  { id: "s2", items: [{ id: "c" }, { id: "d" }, { id: "e" }] },
];

describe("addRecipeTarget", () => {
  it("goes right after the recipe on screen", () => {
    expect(addRecipeTarget(nav("recipe", "c"), sections)).toEqual({ sectionId: "s2", index: 1, anchorId: "c" });
  });

  it("treats a recipe's facing photo as the recipe", () => {
    expect(addRecipeTarget(nav("image", "a"), sections)).toEqual({ sectionId: "s1", index: 1, anchorId: "a" });
  });

  it("goes to the top of a chapter from its opener or its photo", () => {
    expect(addRecipeTarget(nav("divider", "s2"), sections)).toEqual({ sectionId: "s2", index: 0, anchorId: "s2" });
    expect(addRecipeTarget(nav("section-photo", "s2"), sections)).toEqual({ sectionId: "s2", index: 0, anchorId: "s2" });
  });

  it("goes to the end of the book from the cover, contents, or nowhere", () => {
    const end = { sectionId: "s2", index: 3, anchorId: "e" };
    expect(addRecipeTarget(nav("cover", "cover-front"), sections)).toEqual(end);
    expect(addRecipeTarget(nav("toc", "toc"), sections)).toEqual(end);
    expect(addRecipeTarget(null, sections)).toEqual(end);
  });

  it("falls back to the end when the page's recipe is gone", () => {
    expect(addRecipeTarget(nav("recipe", "zzz"), sections)).toEqual({ sectionId: "s2", index: 3, anchorId: "e" });
  });

  it("has no answer for a book with no chapters", () => {
    expect(addRecipeTarget(null, [])).toBeNull();
  });
});
