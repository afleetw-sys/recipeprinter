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
