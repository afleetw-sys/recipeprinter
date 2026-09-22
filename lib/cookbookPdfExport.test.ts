import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertExportPhotosAreRemote,
  cookbookPdfFileName,
  coverWrapProject,
  prepareCookbookCover,
  prepareCookbookDownload,
  trimSizeLabel,
} from "@/lib/cookbookPdfExport";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import { strFromU8, unzipSync } from "fflate";

afterEach(() => vi.unstubAllGlobals());

describe("trimSizeLabel", () => {
  it("names the physical page size, dropping a trailing .0", () => {
    expect(trimSizeLabel(getCookbookPreset("us-letter"))).toBe("8.5x11");
    expect(trimSizeLabel(getCookbookPreset("hardcover-8x10"))).toBe("8x10");
  });
});

describe("cookbookPdfFileName", () => {
  it("carries the trim size, so a print shop's size question is answerable", () => {
    expect(cookbookPdfFileName("Our Favorite Recipes", "us-letter")).toBe(
      "Our-Favorite-Recipes-Standard-8.5x11.pdf",
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
    expect(cookbookPdfFileName(undefined, "us-letter")).toBe("Cookbook-Standard-8.5x11.pdf");
    expect(cookbookPdfFileName("   ", "us-letter")).toBe("Cookbook-Standard-8.5x11.pdf");
    // Punctuation-only titles slug to nothing and must not yield "-Standard-8.5x11.pdf".
    expect(cookbookPdfFileName("!!!", "us-letter")).toBe("Cookbook-Standard-8.5x11.pdf");
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

describe("export photo preflight", () => {
  const project = { id: "book-1", sections: [] } as unknown as import("@/types/recipe").PrintProject;

  it("stops before rendering when even one browser-local photo remains", async () => {
    await expect(
      assertExportPhotosAreRemote(project, async () => ["https://cdn.example/a.jpg", "blob:failed"]),
    ).rejects.toThrow(/couldn't prepare one photo/i);
  });

  it("accepts a fully remote photo set", async () => {
    await expect(
      assertExportPhotosAreRemote(project, async () => ["https://cdn.example/a.jpg"]),
    ).resolves.toBeUndefined();
  });
});

describe("cover-only retry", () => {
  it("requests only the cover from an already prepared interior", async () => {
    const requests: Array<Record<string, unknown>> = [];
    // The route no longer hands back the PDF directly (a large hardcover
    // interior can exceed what a single HTTP response may carry) — it
    // returns {downloadUrl, pageCount}, and the caller fetches the file
    // itself from that URL as a second request. Both hops go through the
    // same stubbed `fetch` here.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://storage.example/cover.pdf") {
          return new Response(new Blob(["%PDF-cover"]), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          });
        }
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ downloadUrl: "https://storage.example/cover.pdf", pageCount: 1 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const project = {
      id: "book-1",
      cover: { title: "Family Table" },
      sections: [{ id: "s1", title: "Mains", items: [{ id: "r1", recipe: { title: "Soup" } }] }],
      settings: { template: "classic" },
    } as unknown as import("@/types/recipe").PrintProject;
    const cover = await prepareCookbookCover({
      project,
      preset: "hardcover-8x10",
      file: { name: "pages.pdf", blob: new Blob(), role: "pages" },
      pageCount: 128,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.mode).toBe("cover-wrap");
    expect((requests[0]?.project as { sections: unknown[] }).sections).toEqual([]);
    expect(cover?.role).toBe("cover");
  });
});

describe("automatic download packaging", () => {
  it("keeps a one-file export as a PDF", async () => {
    const pdf = new Blob(["%PDF-pages"], { type: "application/pdf" });
    const download = await prepareCookbookDownload([
      { name: "Family-Standard-8.5x11.pdf", blob: pdf, role: "pages" },
    ]);
    expect(download.name).toBe("Family-Standard-8.5x11.pdf");
    expect(download.blob).toBe(pdf);
  });

  it("packages both hardcover PDFs into one automatic ZIP", async () => {
    const download = await prepareCookbookDownload([
      { name: "Family-Hardcover-8x10.pdf", blob: new Blob(["%PDF-pages"]), role: "pages" },
      { name: "Family-Cover-Hardcover-8x10.pdf", blob: new Blob(["%PDF-cover"]), role: "cover" },
    ]);
    const files = unzipSync(new Uint8Array(await download.blob.arrayBuffer()));
    expect(download.name).toBe("Family-Hardcover-8x10-Print-Files.zip");
    expect(strFromU8(files["Family-Hardcover-8x10.pdf"]!)).toBe("%PDF-pages");
    expect(strFromU8(files["Family-Cover-Hardcover-8x10.pdf"]!)).toBe("%PDF-cover");
  });
});
