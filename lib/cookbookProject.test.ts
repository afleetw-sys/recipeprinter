import { describe, expect, it } from "vitest";
import {
  deleteSectionFromMeta,
  normalizeProjectMeta,
  recipePagePlacementHasValues,
} from "@/lib/project";
import { assemblePrintProject } from "@/lib/printProjects";

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

describe("deleteSectionFromMeta", () => {
  const base = () =>
    normalizeProjectMeta({
      sections: [
        { id: "s0", title: "Starters", itemIds: ["a"] },
        { id: "s1", title: "Mains", itemIds: ["b"] },
        { id: "s2", title: "Desserts", itemIds: ["c"] },
      ],
    });

  it("merges a middle section's recipes into the preceding section", () => {
    const next = deleteSectionFromMeta(base(), "s1");
    expect(next.sections.map((s) => s.id)).toEqual(["s0", "s2"]);
    expect(next.sections.find((s) => s.id === "s0")?.itemIds).toEqual(["a", "b"]);
    expect(next.sections.find((s) => s.id === "s2")?.itemIds).toEqual(["c"]);
  });

  it("merges the third section into the immediately preceding one, not the first", () => {
    const next = deleteSectionFromMeta(base(), "s2");
    expect(next.sections.map((s) => s.id)).toEqual(["s0", "s1"]);
    expect(next.sections.find((s) => s.id === "s1")?.itemIds).toEqual(["b", "c"]);
    expect(next.sections.find((s) => s.id === "s0")?.itemIds).toEqual(["a"]);
  });

  it("merges the first section's recipes into the following section", () => {
    const next = deleteSectionFromMeta(base(), "s0");
    expect(next.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(next.sections.find((s) => s.id === "s1")?.itemIds).toEqual(["b", "a"]);
  });

  it("dissolves the only section into an untitled pool, keeping its recipes", () => {
    const single = normalizeProjectMeta({
      sections: [{ id: "only", title: "Everything", itemIds: ["a", "b"] }],
    });
    const next = deleteSectionFromMeta(single, "only");
    expect(next.sections).toHaveLength(1);
    expect(next.sections[0].itemIds).toEqual(["a", "b"]);
    expect(next.sections[0].title).toBeUndefined();
  });

  it("is a no-op for an unknown section id", () => {
    const meta = base();
    expect(deleteSectionFromMeta(meta, "nope")).toBe(meta);
  });
});

describe("stashed cookbook survives a save/reopen", () => {
  // Switching a book to recipe cards tucks it into `stashedCookbook` and also
  // detaches the working copy onto a fresh project id. The stash therefore has
  // to reach the SAVED document — when it didn't, reopening that card project
  // found no stash and quietly scaffolded a brand-new book over the one the
  // confirm dialog promised was only set aside.
  const stash = {
    cover: { title: "Our Favorite Recipes", template: "heirloom" as const },
    tableOfContents: true,
    photoStyle: "full" as const,
    cookbookPreset: "us-letter" as const,
    sections: [{ id: "s1", title: "Dinner", itemIds: ["r1", "r2"] }],
    itemPlacements: { r1: { pageLayout: "image-spread" as const } },
  };

  it("is carried into the assembled project document", () => {
    const project = assemblePrintProject({
      id: "p1",
      ownerUid: "u1",
      sections: [],
      settings: {
        cardSize: "letter",
        template: "classic",
        doubleSided: true,
        showPhoto: false,
        showSourceUrl: false,
        showCutLines: false,
      },
      stashedCookbook: stash,
    });
    expect(project.kind).toBe("printProject");
    expect(project.stashedCookbook?.cover?.title).toBe("Our Favorite Recipes");
    expect(project.stashedCookbook?.sections[0].itemIds).toEqual(["r1", "r2"]);
    expect(project.stashedCookbook?.itemPlacements?.r1.pageLayout).toBe("image-spread");
  });

  it("survives the normalization a reopened project passes through", () => {
    const normalized = normalizeProjectMeta({ sections: [], stashedCookbook: stash });
    expect(normalized.stashedCookbook?.cover?.title).toBe("Our Favorite Recipes");
    expect(normalized.stashedCookbook?.tableOfContents).toBe(true);
    expect(normalized.stashedCookbook?.cookbookPreset).toBe("us-letter");
  });

  it("leaves a project that was never a cookbook without one", () => {
    expect(normalizeProjectMeta({ sections: [] }).stashedCookbook).toBeUndefined();
  });
});
