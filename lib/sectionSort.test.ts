import { describe, expect, it } from "vitest";
import { compareRecipeTitles, sectionOrderChanged, sortSectionsByTitle } from "./sectionSort";

const titles: Record<string, string> = {
  a: "Apple Cake", b: "banana bread", c: "Cherry Pie", d: "Recipe 9", e: "Recipe 10", f: "",
};
const titleFor = (id: string) => titles[id] ?? "";

describe("sortSectionsByTitle", () => {
  it("sorts within each section and never reorders the sections", () => {
    const sections = [
      { id: "s1", itemIds: ["c", "a", "b"] },
      { id: "s2", itemIds: ["e", "d"] },
    ];
    expect(sortSectionsByTitle(sections, titleFor)).toEqual([
      { id: "s1", itemIds: ["a", "b", "c"] },
      { id: "s2", itemIds: ["d", "e"] },
    ]);
  });

  it("is case-insensitive, so lowercase titles do not sink to the bottom", () => {
    expect(compareRecipeTitles("banana bread", "Cherry Pie")).toBeLessThan(0);
  });

  it("orders numbered titles the way a person reads them", () => {
    expect(compareRecipeTitles("Recipe 9", "Recipe 10")).toBeLessThan(0);
  });

  it("does not mutate the sections it was given", () => {
    const sections = [{ id: "s1", itemIds: ["c", "a"] }];
    sortSectionsByTitle(sections, titleFor);
    expect(sections[0].itemIds).toEqual(["c", "a"]);
  });

  it("keeps an untitled recipe in the list rather than dropping it", () => {
    const sorted = sortSectionsByTitle([{ id: "s1", itemIds: ["a", "f"] }], titleFor);
    expect(sorted[0].itemIds).toHaveLength(2);
  });
});

describe("sectionOrderChanged", () => {
  it("is false for an order that is already sorted", () => {
    const current = [{ itemIds: ["a", "b"] }];
    expect(sectionOrderChanged(current, sortSectionsByTitle(current, titleFor))).toBe(false);
  });

  it("is true once a newly added recipe belongs earlier", () => {
    const current = [{ itemIds: ["b", "c", "a"] }];
    expect(sectionOrderChanged(current, sortSectionsByTitle(current, titleFor))).toBe(true);
  });

  it("notices a recipe added or removed", () => {
    expect(sectionOrderChanged([{ itemIds: ["a"] }], [{ itemIds: ["a", "b"] }])).toBe(true);
  });

  it("notices a section added", () => {
    expect(sectionOrderChanged([{ itemIds: [] }], [{ itemIds: [] }, { itemIds: [] }])).toBe(true);
  });
});
