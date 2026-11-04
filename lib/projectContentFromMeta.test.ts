import { describe, expect, it } from "vitest";
import {
  projectContentFromMeta,
  savedProjectOpensAsCookbook,
  type PrintLayoutSettings,
} from "@/lib/printProjects";
import type { ProjectMeta } from "@/lib/project";

/* What a saved project takes from the working copy's metadata.
 *
 * Three callers built this by hand — the account save, the PDF export, and the
 * device shelf — and were written to agree without sharing a line of code. They
 * didn't: the shelf silently stopped carrying `railSortMode`, so a book filed on
 * the way out of the workspace came back having forgotten it was sorted A-Z.
 *
 * They read one function now, so this is where that agreement is asserted. The
 * settings test below fails if a field is added to `PrintProjectSettings` and
 * wired into only one of them. */

const LAYOUT: PrintLayoutSettings = {
  cardSize: "card-6x4",
  template: "bistro",
  doubleSided: false,
  showPhoto: true,
  showSourceUrl: true,
  showCutLines: true,
  showDescription: true,
};

function meta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return { sections: [], ...overrides };
}

describe("what a project takes from its metadata", () => {
  it("carries the rail sort mode, which the device shelf used to drop", () => {
    const content = projectContentFromMeta(meta({ railSortMode: "title" }), LAYOUT);
    expect(content.settings.railSortMode).toBe("title");
  });

  it("carries every book setting the metadata holds", () => {
    const content = projectContentFromMeta(
      meta({
        cookbookMode: true,
        tableOfContents: true,
        sectionDividers: true,
        cookbookPreset: "hardcover-8x10",
        cookbookWelcomeCompleted: true,
        tocKicker: "In this book",
        tocTitle: "Contents",
        photoStyle: "full",
        railSortMode: "title",
        lastImportSource: "text",
      }),
      LAYOUT,
    );
    expect(content.settings).toEqual({
      ...LAYOUT,
      cookbookMode: true,
      tableOfContents: true,
      sectionDividers: true,
      // Named `bookPreset` in a saved document and `cookbookPreset` in the
      // working copy — a rename that only one of the three callers has to get
      // right now.
      bookPreset: "hardcover-8x10",
      cookbookWelcomeCompleted: true,
      tocKicker: "In this book",
      tocTitle: "Contents",
      photoStyle: "full",
      railSortMode: "title",
      lastImportSource: "text",
    });
  });

  /* "Print as recipe cards instead" moves the cover, chapters and front matter
     into `stashedCookbook` and leaves the live meta almost empty. An autosave
     that read only the live fields wrote that emptiness over the saved document:
     a purchased cookbook came back as a card project, renamed after its first
     recipe, with its cover and dedication gone from the record. */
  describe("a book set aside is still a book", () => {
    const stashed = meta({
      stashedCookbook: {
        cover: { title: "Nana's Kitchen", template: "heirloom" },
        backCover: { title: "Back", template: "heirloom" },
        dedication: { title: "For Nana", template: "heirloom" },
        frontMatter: { kind: "dedication", body: "For Nana" },
        sections: [],
      },
    });

    it("takes its cover and front matter from the stash", () => {
      const content = projectContentFromMeta(stashed, LAYOUT);
      expect(content.cover?.title).toBe("Nana's Kitchen");
      expect(content.backCover?.title).toBe("Back");
      expect(content.dedication?.title).toBe("For Nana");
      expect(content.frontMatter?.body).toBe("For Nana");
    });

    it("is still a cookbook, even with the live view set to cards", () => {
      const content = projectContentFromMeta(stashed, LAYOUT);
      expect(content.kind).toBe("cookbook");
    });

    /* The DOCUMENT is a cookbook and the VIEW is cards, and reopening has to
       land the cook back in cards. `exitCookbook` now records that view as an
       explicit `false`; it used to leave it unset, and an unset field is
       dropped on the way into Firestore, where the fallback was the kind — so
       "print as recipe cards instead" survived a reload for nobody. */
    it("records recipe cards as the view, so reopening does not undo the choice", () => {
      const content = projectContentFromMeta(meta({ ...stashed, cookbookMode: false }), LAYOUT);
      expect(content.settings.cookbookMode).toBe(false);
      expect(savedProjectOpensAsCookbook({ ...content, stashedCookbook: stashed.stashedCookbook })).toBe(
        false,
      );
    });

    it("prefers the live cover when there is one", () => {
      const content = projectContentFromMeta(
        meta({ ...stashed, cover: { title: "Live", template: "classic" } }),
        LAYOUT,
      );
      expect(content.cover?.title).toBe("Live");
    });
  });

  /* Which of the two experiences a saved document reopens in. Separate places
     to be, and the cook's own choice about which one they were in. */
  describe("reopening a saved project", () => {
    const book = { title: "Nana's Kitchen", template: "heirloom" } as const;
    const stash = { cover: book, sections: [] };

    it("opens in the view the cook was last in", () => {
      expect(
        savedProjectOpensAsCookbook({ kind: "cookbook", settings: { cookbookMode: true } }),
      ).toBe(true);
      expect(
        savedProjectOpensAsCookbook({ kind: "cookbook", settings: { cookbookMode: false } }),
      ).toBe(false);
    });

    /* Documents saved before the view was recorded. A stash exists only because
       somebody moved the book into it, and moving it there IS leaving cookbook
       mode — so these reopen as cards rather than as the book they left. */
    it("reads a stashed book as having been set aside", () => {
      expect(
        savedProjectOpensAsCookbook({ kind: "cookbook", settings: {}, stashedCookbook: stash }),
      ).toBe(false);
    });

    it("falls back to the kind only when there is nothing else to go on", () => {
      expect(savedProjectOpensAsCookbook({ kind: "cookbook", settings: {} })).toBe(true);
      expect(savedProjectOpensAsCookbook({ kind: "printProject", settings: {} })).toBe(false);
    });
  });

  it("is a card project only when there is no book and none set aside", () => {
    expect(projectContentFromMeta(meta(), LAYOUT).kind).toBe("printProject");
    expect(projectContentFromMeta(meta({ cookbookMode: true }), LAYOUT).kind).toBe("cookbook");
  });

  it("keeps a typed name separate from the cover's, so a rename survives", () => {
    const content = projectContentFromMeta(
      meta({ projectTitle: "Christmas baking", cover: { title: "Nana's", template: "classic" } }),
      LAYOUT,
    );
    expect(content.projectTitle).toBe("Christmas baking");
    expect(content.cover?.title).toBe("Nana's");
  });
});

/* A book comes back from the account as it went in. Every part of a cookbook
   the workspace keeps is saved by `projectContentFromMeta` and read back by
   `metaFromProject`, and anything one of them leaves out is lost the next time
   the book is opened somewhere else, or reloaded. The fixture is typed to need
   every field of `ProjectMeta` that a book keeps, so a new one can't be added
   without this test holding it (Amelia, 2026-11-04: a dedication added back
   came back missing after a reload). */
describe("a saved book reopens with every part it was saved with", () => {
  /** Only these are not the book: they steer the first arrival and are spent. */
  type Transient = "cookbookIntent" | "cookbookBornFresh" | "cookbookIntroduced";
  const book: Required<Omit<ProjectMeta, Transient>> = {
    projectId: "proj-1",
    sourceProjectId: "older-1",
    projectTitle: "Ruth's book",
    cover: { title: "Our Favorite Recipes", subtitle: "Again", author: "The Wingers", edition: "2026", template: "bistro" },
    backCover: { title: "", blurb: "Thanks for cooking", author: "From us", template: "bistro" },
    dedication: { title: "Old dedication", blurb: "Legacy", template: "bistro" },
    frontMatter: { kind: "dedication", heading: "Dedication", body: "For Grandma Ruth", signature: "With love" },
    cookbookWelcomeCompleted: true,
    photoStyle: "full",
    ownPhotosOnly: true,
    websitePhotos: true,
    pageLooks: { cover: { elements: { "cover-title": { textSize: 1.2 } } } },
    tableOfContents: true,
    tocKicker: "In this book",
    tocTitle: "Inside",
    railSortMode: "title",
    lastImportSource: "text",
    sectionDividers: true,
    cookbookMode: true,
    optionalLinesExplicit: true,
    sampleLines: true,
    cookbookPreset: "hardcover-8x10",
    sections: [
      {
        id: "s1",
        title: "Dinners",
        titleOverride: "Weeknight dinners",
        subtitle: "Fast",
        cardPhotoMode: "photo",
        cardPhotoUrl: "https://x/opener.jpg",
        cardGridImages: ["https://x/a.jpg"],
        artPhotoMode: "grid",
        artPhotoUrl: "https://x/art.jpg",
        artGridImages: ["https://x/b.jpg"],
        artCaption: "Sunday",
        intro: "What we make most",
        showOpener: true,
        numberAsChapter: true,
        itemIds: ["r1"],
      },
    ],
    itemPlacements: { r1: { pageLayout: "image-spread", heroImageUrl: "https://x/hero.jpg", heroZoom: 1.4, showPhoto: true, photoUrl: "https://x/p.jpg" } },
    stashedCookbook: { sections: [], cover: { title: "Stashed", template: "classic" } },
  };

  it("keeps each of them through a save and a reopen", async () => {
    const { assemblePrintProject, metaFromProject } = await import("@/lib/printProjects");
    const { buildSections, normalizeProjectMeta } = await import("@/lib/project");
    const { stripUndefined } = await import("@/lib/firebase/stripUndefined");
    const items = [
      {
        id: "r1",
        method: "manual" as const,
        source: "test",
        status: "ready" as const,
        title: "Bread",
        addedAt: 0,
        recipe: { title: "Bread", ingredients: [{ raw: "flour" }], instructions: [{ step: 1, text: "Bake." }] },
      },
    ];
    const saved = assemblePrintProject({
      ...projectContentFromMeta(book, LAYOUT),
      id: book.projectId,
      ownerUid: "user-1",
      sections: buildSections(items, book),
    });
    // Firestore keeps what JSON keeps and drops what is undefined.
    const stored = JSON.parse(JSON.stringify(stripUndefined(saved)));
    const reopened = normalizeProjectMeta(metaFromProject(stored));
    const expected = normalizeProjectMeta(book);
    for (const part of Object.keys(book) as (keyof typeof book)[]) {
      expect(reopened[part], part).toEqual(expected[part]);
    }
  });
});
