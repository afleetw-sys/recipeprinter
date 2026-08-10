import { describe, expect, it } from "vitest";
import { normalizeProjectMeta, recipePagePlacementHasValues } from "@/lib/project";

describe("cookbook project normalization", () => {
  it("adds a stable project shape without changing recipe ordering", () => {
    const normalized = normalizeProjectMeta({
      sections: [{ id: "one", title: "", itemIds: ["r2", "r1"] }],
    });
    expect(normalized.projectId).toBeTruthy();
    expect(normalized.sections[0].itemIds).toEqual(["r2", "r1"]);
    expect(normalized.sections[0].showOpener).toBe(false);
  });

  it("restores opener pages for named sections even if an older project disabled them", () => {
    const normalized = normalizeProjectMeta({
      sections: [{ id: "one", title: "Dinner", showOpener: false, itemIds: ["r1"] }],
    });
    expect(normalized.sections[0].showOpener).toBe(true);
  });

  it("migrates legacy chapter pages, cover styles, and dedication content", () => {
    const normalized = normalizeProjectMeta({
      sectionDividers: true,
      sections: [{ id: "dessert", title: "Desserts", itemIds: ["cookie"] }],
      cover: { title: "Family Recipes", template: "classic", imageUrl: "cover.jpg" },
      dedication: { title: "", template: "classic", blurb: "For Mom" },
    });
    expect(normalized.sections[0]).toMatchObject({
      showOpener: true,
      numberAsChapter: true,
    });
    expect(normalized.cover?.layout).toBe("photo");
    expect(normalized.frontMatter).toEqual({
      kind: "dedication",
      heading: "Dedication",
      body: "For Mom",
    });
  });

  it("does not create front matter from an empty legacy dedication", () => {
    const normalized = normalizeProjectMeta({
      sections: [],
      dedication: { title: "", template: "classic", blurb: "  " },
    });
    expect(normalized.frontMatter).toBeUndefined();
  });

  it("keeps focal-point-only and photo-override recipe placements", () => {
    expect(recipePagePlacementHasValues({ heroFocusX: 0, heroFocusY: 72 })).toBe(true);
    expect(recipePagePlacementHasValues({ showPhoto: false })).toBe(true);
    expect(recipePagePlacementHasValues({})).toBe(false);
  });
});
