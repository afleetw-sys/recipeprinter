import { describe, expect, it } from "vitest";
import { cookbookPdfFileName, coverWrapProject, trimSizeLabel } from "@/lib/cookbookPdfExport";
import { getCookbookPreset } from "@/lib/cookbookPresets";

describe("trimSizeLabel", () => {
  it("names the physical page size, dropping a trailing .0", () => {
    expect(trimSizeLabel(getCookbookPreset("us-letter"))).toBe("8.5x11");
    expect(trimSizeLabel(getCookbookPreset("hardcover-8x10"))).toBe("8x10");
  });
});

describe("cookbookPdfFileName", () => {
  it("carries the trim size, so a print shop's size question is answerable", () => {
    expect(cookbookPdfFileName("Our Favorite Recipes", "us-letter")).toBe(
      "Our-Favorite-Recipes-Spiral-8.5x11.pdf",
    );
    expect(cookbookPdfFileName("Our Favorite Recipes", "hardcover-8x10")).toBe(
      "Our-Favorite-Recipes-Hardcover-8x10.pdf",
    );
  });

  it("still distinguishes the two formats of the same book", () => {
    const a = cookbookPdfFileName("Family Table", "us-letter");
    const b = cookbookPdfFileName("Family Table", "hardcover-8x10");
    expect(a).not.toBe(b);
  });

  it("falls back to a usable name when the book is untitled", () => {
    expect(cookbookPdfFileName(undefined, "us-letter")).toBe("Cookbook-Spiral-8.5x11.pdf");
    expect(cookbookPdfFileName("   ", "us-letter")).toBe("Cookbook-Spiral-8.5x11.pdf");
    // Punctuation-only titles slug to nothing and must not yield "-Spiral-8.5x11.pdf".
    expect(cookbookPdfFileName("!!!", "us-letter")).toBe("Cookbook-Spiral-8.5x11.pdf");
  });
});

describe("coverWrapProject", () => {
  const book = {
    id: "book-1",
    kind: "cookbook",
    revision: 3,
    ownerUid: "user-1",
    title: "Family Favorites",
    cover: { title: "Family Favorites", blurb: "ours" },
    backCover: { title: "The End" },
    dedication: { title: "For Nan" },
    frontMatter: { tocTitle: "Contents" },
    settings: { template: "bistro", cookbookMode: true },
    sections: [
      { id: "s1", title: "Mains", items: [{ id: "r1", recipe: { title: "Soup", ingredients: [{ raw: "2 cups flour" }] } }] },
    ],
    itemPlacements: { r1: { pageLayout: "image-spread" } },
    stashedCookbook: { cover: { title: "Set aside" }, sections: [], itemPlacements: {} },
    createdAt: 1,
    updatedAt: 2,
  } as unknown as import("@/types/recipe").PrintProject;

  it("drops the recipes, which the wrap never draws", () => {
    const wrap = coverWrapProject(book);
    expect(wrap.sections).toEqual([]);
    expect(wrap.itemPlacements).toBeUndefined();
    expect(wrap.stashedCookbook).toBeUndefined();
    // The whole point: a hardcover stops uploading every recipe a second time.
    expect(JSON.stringify(wrap)).not.toContain("2 cups flour");
  });

  it("keeps everything the wrap actually reads", () => {
    const wrap = coverWrapProject(book);
    // CoverWrapDocument reads exactly these; the route reads `id`.
    expect(wrap.cover).toEqual(book.cover);
    expect(wrap.backCover).toEqual(book.backCover);
    expect(wrap.settings.template).toBe("bistro");
    expect(wrap.id).toBe("book-1");
  });

  it("is subtractive, so a field added to the wrap later still travels", () => {
    const wrap = coverWrapProject(book);
    // An allowlist would have dropped these the day someone used them.
    expect(wrap.dedication).toEqual(book.dedication);
    expect(wrap.frontMatter).toEqual(book.frontMatter);
    expect(wrap.title).toBe("Family Favorites");
  });

  it("leaves the original book untouched", () => {
    coverWrapProject(book);
    expect(book.sections).toHaveLength(1);
    expect(book.itemPlacements).toBeDefined();
  });
});
