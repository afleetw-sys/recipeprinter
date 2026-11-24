import { describe, expect, it } from "vitest";
import type { ImportMethod } from "@/types/recipe";
import { bookRecipeImage, hasWebsitePhoto, heroCrop, photoModeForNewPhoto, withoutEmptyPhotos } from "@/lib/bookPhotos";
import type { ProjectMeta } from "@/lib/project";
import type { PageSheet, SheetSlot } from "@/lib/usePrintSheets";

// A cookbook of the cook's own photos keeps a photo that came out of the cook's
// own file (a photo they imported from, a Paprika export) and holds back one a
// website published. A Paprika library's photos used to vanish from every book.
describe("bookRecipeImage in a book of the cook's own photos", () => {
  const ownFile: ImportMethod[] = ["image", "paprika"];
  const fromElsewhere: ImportMethod[] = ["url", "text", "cookpilot", "shared", "manual"];

  it("keeps a photo from the cook's own file and holds back the rest", () => {
    for (const method of ownFile) {
      expect(bookRecipeImage({ method, recipe: { image: "photo.jpg" } }, undefined, true), method).toBe("photo.jpg");
    }
    for (const method of fromElsewhere) {
      expect(bookRecipeImage({ method, recipe: { image: "photo.jpg" } }, undefined, true), method).toBeUndefined();
    }
  });
});

// A photo the cook chose is part of the recipe, so a linked recipe shows the
// same photo as a card and in every book, whichever of them it was chosen in.
// What a format does with it (whether a book holds back website photos, a
// full-page crop) stays the format's own.
describe("a chosen photo follows the recipe into every format", () => {
  const chosen = { method: "url" as ImportMethod, recipe: { image: "mine.jpg", imageChosen: true } };

  it.each([
    ["a book of the cook's own photos", true],
    ["an older book", false],
  ])("%s shows it", (_name, ownPhotosOnly) => {
    expect(bookRecipeImage(chosen, undefined, ownPhotosOnly)).toBe("mine.jpg");
  });

  it("wins over a choice an older version kept on the book's page", () => {
    expect(bookRecipeImage(chosen, { photoUrl: "old-choice.jpg" }, true)).toBe("mine.jpg");
  });

  it("a removed photo is removed everywhere", () => {
    expect(bookRecipeImage({ method: "url", recipe: { image: "", imageChosen: true } }, undefined, true)).toBeUndefined();
  });

  it("without a choice, the book's own rules still apply", () => {
    expect(bookRecipeImage({ method: "url", recipe: { image: "site.jpg" } }, { photoUrl: "page.jpg" }, true)).toBe("page.jpg");
    expect(bookRecipeImage({ method: "url", recipe: { image: "site.jpg" } }, undefined, true)).toBeUndefined();
    expect(bookRecipeImage({ method: "url", recipe: { image: "site.jpg" } }, undefined, true, true)).toBe("site.jpg");
  });

  it("is not a website photo the book holds back", () => {
    expect(hasWebsitePhoto(chosen)).toBe(false);
    expect(hasWebsitePhoto({ method: "url", recipe: { image: "site.jpg" } })).toBe(true);
  });
});

describe("heroCrop", () => {
  const placement = { heroFocusX: 20, heroFocusY: 70, heroZoom: 1.5, heroCropFor: "a.jpg" };

  it("applies to the photo it was set on", () => {
    expect(heroCrop(placement, "a.jpg")).toEqual({ focusX: 20, focusY: 70, zoom: 1.5 });
  });

  it("does not follow a different photo: a photo changed from a linked card starts centred", () => {
    expect(heroCrop(placement, "b.jpg")).toEqual({});
  });

  it("a crop made before crops were tied to a photo keeps applying", () => {
    expect(heroCrop({ heroFocusX: 20 }, "anything.jpg")).toEqual({ focusX: 20, focusY: undefined, zoom: undefined });
  });
});

// A photo added to a recipe that showed none used to land In page whatever the
// book's Photos were set to, so a Full page book grew In page recipes.
describe("photoModeForNewPhoto", () => {
  it("follows the book's Photos, and shows the photo when the book shows none", () => {
    expect(photoModeForNewPhoto("full")).toBe("full");
    expect(photoModeForNewPhoto("card")).toBe("card");
    expect(photoModeForNewPhoto("none")).toBe("card");
  });
});

// A book of the cook's own photos used to refuse to export while any photo
// page was still a placeholder. The export sets those to None itself.
describe("withoutEmptyPhotos", () => {
  const recipe = (recipeId: string, image?: string): SheetSlot =>
    ({ kind: "recipe", recipeId, recipe: { title: recipeId, image }, label: recipeId, showPhoto: true, isContinuation: false }) as unknown as SheetSlot;
  const sheet = (slot: SheetSlot): PageSheet => ({ id: Math.random().toString(), slots: [slot], backGroupNeeded: false });
  const meta: ProjectMeta = {
    sections: [
      { id: "s1", title: "Soups", itemIds: ["a", "b", "c", "d"], artPhotoMode: "photo" },
      { id: "s2", title: "Sides", itemIds: [], artPhotoMode: "photo", artPhotoUrl: "kept.jpg" },
    ],
    ownPhotosOnly: true,
    photoStyle: "full",
    itemPlacements: { b: { photoUrl: "", showSourceUrl: true } },
  };
  const sheets = [
    sheet({ kind: "section-photo", sectionId: "s1", title: "Soups", mode: "photo" }),
    sheet({ kind: "section-photo", sectionId: "s2", title: "Sides", mode: "photo", photoUrl: "kept.jpg" }),
    sheet({ kind: "image", recipeId: "a", label: "a", imageUrl: "", queueIndex: 0 }),
    sheet(recipe("a")),
    sheet(recipe("b")), // an in-page photo still waiting
    sheet(recipe("c", "c.jpg")),
    sheet({ kind: "image", recipeId: "d", label: "d", imageUrl: "d.jpg", queueIndex: 3 }),
  ];

  it("sets every waiting photo, full page, in page or chapter, to None and nothing else", () => {
    const result = withoutEmptyPhotos(meta, sheets);
    expect(result.recipeIds.sort()).toEqual(["a", "b"]);
    expect(result.sectionIds).toEqual(["s1"]);
    for (const id of ["a", "b"]) {
      expect(result.meta.itemPlacements?.[id]).toMatchObject({ pageLayout: "full", showPhoto: false });
    }
    // What the cook set on the recipe stays.
    expect(result.meta.itemPlacements?.b).toMatchObject({ photoUrl: "", showSourceUrl: true });
    expect(result.meta.itemPlacements?.c).toBeUndefined();
    expect(result.meta.itemPlacements?.d).toBeUndefined();
    expect(result.meta.sections.map((section) => section.artPhotoMode)).toEqual(["none", "photo"]);
  });

  it("leaves a book that isn't only the cook's own photos alone", () => {
    const plain = { ...meta, ownPhotosOnly: false };
    const result = withoutEmptyPhotos(plain, sheets);
    expect(result.meta).toBe(plain);
    expect(result.recipeIds).toEqual([]);
  });
});
