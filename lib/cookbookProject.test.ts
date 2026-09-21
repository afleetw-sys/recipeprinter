import { describe, expect, it } from "vitest";
import {
  deleteSectionFromMeta,
  moveItemsInMeta,
  normalizeProjectMeta,
  projectDisplayTitle,
  recipePagePlacementHasValues,
  resolveCardPhotoMode,
  resolveArtPhotoMode,
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

describe("resolveCardPhotoMode", () => {
  it("follows the book's card setting when the opener has no choice of its own", () => {
    expect(resolveCardPhotoMode({}, "card")).toBe("photo");
    expect(resolveCardPhotoMode({}, "full")).toBe("none");
    expect(resolveCardPhotoMode({}, "none")).toBe("none");
  });

  it("keeps an opener the cook placed by hand, whatever the book does", () => {
    expect(resolveCardPhotoMode({ cardPhotoMode: "none" }, "card")).toBe("none");
    expect(resolveCardPhotoMode({ cardPhotoMode: "photo" }, "none")).toBe("photo");
    expect(resolveCardPhotoMode({ cardPhotoMode: "grid" }, "none")).toBe("grid");
  });

  it("stays off when the book is unknown", () => {
    expect(resolveCardPhotoMode({})).toBe("none");
  });
});

describe("resolveArtPhotoMode", () => {
  it("follows the book's full-page setting as a collage", () => {
    expect(resolveArtPhotoMode({}, "full")).toBe("grid");
    expect(resolveArtPhotoMode({}, "card")).toBe("none");
    expect(resolveArtPhotoMode({}, "none")).toBe("none");
  });

  it("keeps an opener the cook placed by hand, whatever the book does", () => {
    expect(resolveArtPhotoMode({ artPhotoMode: "none" }, "full")).toBe("none");
    expect(resolveArtPhotoMode({ artPhotoMode: "photo" }, "full")).toBe("photo");
    expect(resolveArtPhotoMode({ artPhotoMode: "grid" }, "none")).toBe("grid");
  });

  it("stays off when the book is unknown", () => {
    expect(resolveArtPhotoMode({})).toBe("none");
  });
});

describe("migrating a legacy section photo into the two independent slots", () => {
  it("migrates an explicit band mode into the card slot, and turns the art slot off", () => {
    const normalized = normalizeProjectMeta({
      sections: [{ id: "s", title: "Mains", photoMode: "band", photoUrl: "hero.jpg", itemIds: [] }],
    });
    expect(normalized.sections[0]).toMatchObject({
      cardPhotoMode: "photo",
      cardPhotoUrl: "hero.jpg",
      artPhotoMode: "none",
    });
  });

  it("migrates an explicit full mode into the art slot, and turns the card slot off", () => {
    const normalized = normalizeProjectMeta({
      sections: [{ id: "s", title: "Mains", photoMode: "full", photoUrl: "hero.jpg", itemIds: [] }],
    });
    expect(normalized.sections[0]).toMatchObject({
      artPhotoMode: "photo",
      artPhotoUrl: "hero.jpg",
      cardPhotoMode: "none",
    });
  });

  it("migrates an explicit grid mode into the art slot's collage", () => {
    const normalized = normalizeProjectMeta({
      sections: [
        { id: "s", title: "Mains", photoMode: "grid", gridImages: ["a.jpg", "b.jpg"], itemIds: [] },
      ],
    });
    expect(normalized.sections[0]).toMatchObject({
      artPhotoMode: "grid",
      artGridImages: ["a.jpg", "b.jpg"],
      cardPhotoMode: "none",
    });
  });

  it("migrates an explicit none mode by turning both slots off", () => {
    const normalized = normalizeProjectMeta({
      sections: [{ id: "s", title: "Mains", photoMode: "none", itemIds: [] }],
    });
    expect(normalized.sections[0]).toMatchObject({ cardPhotoMode: "none", artPhotoMode: "none" });
  });

  it("keeps a bare legacy photo (no explicit mode) as a dormant card photo, following the book", () => {
    const normalized = normalizeProjectMeta({
      sections: [{ id: "s", title: "Mains", photoUrl: "hero.jpg", itemIds: [] }],
    });
    expect(normalized.sections[0].cardPhotoUrl).toBe("hero.jpg");
    expect(normalized.sections[0].cardPhotoMode).toBeUndefined();
    expect(normalized.sections[0].artPhotoMode).toBeUndefined();
  });

  it("leaves an already-migrated section (new fields present) alone", () => {
    const normalized = normalizeProjectMeta({
      sections: [
        {
          id: "s",
          title: "Mains",
          cardPhotoMode: "none",
          artPhotoMode: "photo",
          artPhotoUrl: "art.jpg",
          itemIds: [],
        },
      ],
    });
    expect(normalized.sections[0]).toMatchObject({
      cardPhotoMode: "none",
      artPhotoMode: "photo",
      artPhotoUrl: "art.jpg",
    });
  });
});

describe("moveItemsInMeta", () => {
  const base = () =>
    normalizeProjectMeta({
      sections: [
        { id: "s0", title: "Starters", itemIds: ["a", "m1", "b", "m2", "c"] },
        { id: "s1", title: "Mains", itemIds: ["d"] },
      ],
    });
  const idsIn = (meta: ReturnType<typeof base>, sectionId: string) =>
    meta.sections.find((section) => section.id === sectionId)?.itemIds;

  it("keeps a multi-select together when it moves down past its own members", () => {
    // The drop lands after "c", measured on the list with m1/m2 pulled out
    // (["a", "b", "c"]) — the same index the rail computes.
    const next = moveItemsInMeta(base(), ["m1", "m2"], "s0", 3);
    expect(idsIn(next, "s0")).toEqual(["a", "b", "c", "m1", "m2"]);
  });

  it("keeps a multi-select together when it moves up past its own members", () => {
    const next = moveItemsInMeta(base(), ["m1", "m2"], "s0", 0);
    expect(idsIn(next, "s0")).toEqual(["m1", "m2", "a", "b", "c"]);
  });

  it("moves a selection into another section in the order given", () => {
    const next = moveItemsInMeta(base(), ["m1", "m2"], "s1", 0);
    expect(idsIn(next, "s0")).toEqual(["a", "b", "c"]);
    expect(idsIn(next, "s1")).toEqual(["m1", "m2", "d"]);
  });

  it("clamps past the end and ignores a repeated id", () => {
    const next = moveItemsInMeta(base(), ["m1", "m1"], "s1", 99);
    expect(idsIn(next, "s1")).toEqual(["d", "m1"]);
    expect(idsIn(next, "s0")).toEqual(["a", "b", "m2", "c"]);
  });

  it("is a no-op for an unknown destination", () => {
    const meta = base();
    expect(moveItemsInMeta(meta, ["m1"], "nope", 0)).toBe(meta);
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

/* A rename used to live only in session metadata. The workspace bar showed it,
   the library went on showing the cover's title, and reopening the project
   dropped it — so the one name the cook actually chose was the one name nothing
   kept. `title` is what a list reads; `projectTitle` is what says anyone chose
   it, which is what a reopened project needs in order to tell a rename from a
   cover name. */
describe("a name the cook typed", () => {
  const settings = {
    cardSize: "letter" as const,
    template: "classic" as const,
    doubleSided: true,
    showPhoto: false,
    showSourceUrl: false,
    showCutLines: false,
  };

  it("is what the assembled document is called, and is recorded as chosen", () => {
    const project = assemblePrintProject({
      id: "p1",
      ownerUid: "u1",
      title: "Nana’s Kitchen",
      projectTitle: "Nana’s Kitchen",
      sections: [],
      settings,
      cover: { title: "Our Favorite Recipes", template: "heirloom" },
    });
    expect(project.title).toBe("Nana’s Kitchen");
    expect(project.projectTitle).toBe("Nana’s Kitchen");
  });

  it("is absent on a project nobody renamed, so the cover keeps naming it", () => {
    const project = assemblePrintProject({
      id: "p1",
      ownerUid: "u1",
      title: "Our Favorite Recipes",
      sections: [],
      settings,
      cover: { title: "Our Favorite Recipes", template: "heirloom" },
    });
    expect(project.projectTitle).toBeUndefined();
    expect(projectDisplayTitle({ cover: project.cover })).toBe("Our Favorite Recipes");
  });

  it("survives the normalization a reopened project passes through", () => {
    const normalized = normalizeProjectMeta({ sections: [], projectTitle: "Nana’s Kitchen" });
    expect(normalized.projectTitle).toBe("Nana’s Kitchen");
  });

  it("outranks the cover it was chosen instead of", () => {
    expect(
      projectDisplayTitle({
        projectTitle: "Nana’s Kitchen",
        cover: { title: "Our Favorite Recipes", template: "heirloom" },
      }),
    ).toBe("Nana’s Kitchen");
  });

  it("is not kept when it is only whitespace", () => {
    expect(normalizeProjectMeta({ sections: [], projectTitle: "   " }).projectTitle).toBeUndefined();
  });
});

describe("projectDisplayTitle: falling back to the recipes", () => {
  it("borrows the first recipe's title when nothing else names the project", () => {
    expect(projectDisplayTitle({}, "Banana Bread")).toBe("Banana Bread");
  });

  it("says how many more there are, so a shelf of forty stays findable", () => {
    expect(projectDisplayTitle({}, "Banana Bread", 2)).toBe("Banana Bread + 2 more");
  });

  it("trims the recipe title, and ignores one that is only whitespace", () => {
    expect(projectDisplayTitle({}, "  Banana Bread  ")).toBe("Banana Bread");
    expect(projectDisplayTitle({}, "   ")).toBe("Recipe cards");
  });

  it("ends in a plain label that says which kind of project it is", () => {
    expect(projectDisplayTitle({})).toBe("Recipe cards");
    expect(projectDisplayTitle({ cookbookMode: true })).toBe("Untitled cookbook");
  });

  it("puts a cover title ahead of the recipes, and a whitespace one behind them", () => {
    expect(
      projectDisplayTitle({ cover: { title: "Our Favorite Recipes", template: "heirloom" } }, "Banana Bread", 3),
    ).toBe("Our Favorite Recipes");
    expect(projectDisplayTitle({ cover: { title: "   ", template: "heirloom" } }, "Banana Bread")).toBe(
      "Banana Bread",
    );
  });

  it("falls back to the cover of a book set aside behind a card job", () => {
    expect(
      projectDisplayTitle({
        stashedCookbook: { cover: { title: "The Stashed Book", template: "keepsake" } },
      } as Parameters<typeof projectDisplayTitle>[0]),
    ).toBe("The Stashed Book");
  });
});


describe("a chapter's description line", () => {
  const intro = (value: unknown) =>
    normalizeProjectMeta({ sections: [{ id: "s", title: "Dinner", itemIds: [], intro: value }] })
      .sections[0].intro;

  it("stays undefined when never written, so it follows the chapter's recipes", () => {
    expect(intro(undefined)).toBeUndefined();
  });

  it("stays an empty string when the cook removed it, so a reload does not bring it back", () => {
    expect(intro("")).toBe("");
    expect(intro("   ")).toBe("");
  });

  it("keeps what was written", () => {
    expect(intro("Nana never served fewer than three.")).toBe("Nana never served fewer than three.");
  });
});
