import { describe, expect, it } from "vitest";
import { collectProjectPhotoUrls, mapProjectPhotoUrls, type ProjectPhotos } from "@/lib/photoStorage";
import type { CoverConfig, Section, StashedCookbook } from "@/types/recipe";

/* WHERE a book keeps its photos, asserted once.
 *
 * This used to be answered in three places — the save-time sweep, adoption's
 * asset collector, and adoption's rewriter — none of which had a test about
 * coverage, and they drifted: adoption knew nothing about `dedication` art or a
 * recipe's `photoHistory`. A signed-out cook with a photo on either was adopted
 * into an account whose book still pointed at anonymous storage, which is the
 * exact failure adoption exists to prevent.
 *
 * There is one walk now, so what is worth pinning is the field set it reaches
 * and the fact that collecting and rewriting reach the SAME one. A new photo
 * field fails the first test below until it is walked, and every caller is
 * correct the moment it passes. */

const cover = (name: string): CoverConfig => ({
  title: name,
  template: "heirloom",
  imageUrl: `${name}-image`,
  gridImages: [`${name}-grid-1`, `${name}-grid-2`],
});

/** Every field that can hold a photo, each carrying a distinct, nameable URL. */
function bookWithPhotoEverywhere(): ProjectPhotos {
  const stashedCookbook: StashedCookbook = {
    cover: cover("stash-cover"),
    backCover: cover("stash-back"),
    dedication: cover("stash-dedication"),
    sections: [
      {
        id: "ss1",
        title: "Set aside",
        itemIds: ["r1"],
        photoUrl: "stash-opener",
        gridImages: ["stash-collage-1"],
      },
    ],
    itemPlacements: {
      r1: { heroImageUrl: "stash-hero", photoHistory: ["stash-history-1"] },
    },
  };

  return {
    cover: cover("cover"),
    backCover: cover("back"),
    dedication: cover("dedication"),
    sections: [
      {
        id: "s1",
        title: "Breads",
        photoUrl: "opener",
        gridImages: ["collage-1", "collage-2"],
        items: [
          { id: "r1", recipe: { title: "Sourdough", image: "recipe-photo-1" } },
          { id: "r2", recipe: { title: "Rye", image: "recipe-photo-2" } },
          { id: "r3", recipe: { title: "No photo" } },
        ] as Section["items"],
      } as Section,
    ],
    itemPlacements: {
      r1: { heroImageUrl: "hero", photoHistory: ["history-1", "history-2"] },
    },
    stashedCookbook,
  };
}

const EVERY_PHOTO = [
  "cover-image", "cover-grid-1", "cover-grid-2",
  "back-image", "back-grid-1", "back-grid-2",
  // The two adoption never knew about.
  "dedication-image", "dedication-grid-1", "dedication-grid-2",
  "history-1", "history-2",
  "opener", "collage-1", "collage-2",
  "recipe-photo-1", "recipe-photo-2",
  "hero",
  "stash-cover-image", "stash-cover-grid-1", "stash-cover-grid-2",
  "stash-back-image", "stash-back-grid-1", "stash-back-grid-2",
  "stash-dedication-image", "stash-dedication-grid-1", "stash-dedication-grid-2",
  "stash-opener", "stash-collage-1",
  "stash-hero", "stash-history-1",
];

describe("every field of a book that can hold a photo", () => {
  it("is reached by the walk, and nothing else is", async () => {
    const found = await collectProjectPhotoUrls(bookWithPhotoEverywhere());
    expect([...found].sort()).toEqual([...EVERY_PHOTO].sort());
  });

  it("includes a dedication page's art, which adoption used to miss", async () => {
    const found = await collectProjectPhotoUrls(bookWithPhotoEverywhere());
    expect(found).toContain("dedication-image");
    expect(found).toContain("dedication-grid-1");
    expect(found).toContain("stash-dedication-image");
  });

  it("includes the photos a recipe has worn before, which adoption used to miss", async () => {
    const found = await collectProjectPhotoUrls(bookWithPhotoEverywhere());
    expect(found).toContain("history-1");
    expect(found).toContain("stash-history-1");
  });

  /* The invariant adoption rests on. It copies what the collect pass names and
     then rewrites the book to point at the copies, so a field that is collected
     but not rewritten leaves the account's book pointing at a photo it does not
     own — and the post-save verification would fail the adoption outright. */
  it("rewrites exactly the photos it collects", async () => {
    const book = bookWithPhotoEverywhere();
    const collected = await collectProjectPhotoUrls(book);
    const rewritten = await mapProjectPhotoUrls(book, (url) => `moved:${url}`);

    const after = await collectProjectPhotoUrls(rewritten);
    expect([...after].sort()).toEqual(collected.map((url) => `moved:${url}`).sort());
  });

  it("leaves a recipe with no photo, and every non-photo field, alone", async () => {
    const book = bookWithPhotoEverywhere();
    const rewritten = await mapProjectPhotoUrls(book, (url) => `moved:${url}`);

    const items = rewritten.sections[0]!.items;
    expect(items[2]!.recipe!.image).toBeUndefined();
    // Untouched items come back as the very same object, so a walk that moves
    // nothing does not churn the working copy.
    expect(items[2]).toBe(book.sections[0]!.items[2]);
    expect(rewritten.sections[0]!.title).toBe("Breads");
    expect(rewritten.cover!.title).toBe("cover");
    expect(rewritten.stashedCookbook!.sections[0]!.itemIds).toEqual(["r1"]);
  });

  it("carries through fields it knows nothing about", async () => {
    // Adoption walks a whole PrintProject, not just the photo-bearing slice.
    const book = { ...bookWithPhotoEverywhere(), id: "book-a", ownerUid: "user-1", revision: 3 };
    const rewritten = await mapProjectPhotoUrls(book, (url) => `moved:${url}`);
    expect(rewritten.id).toBe("book-a");
    expect(rewritten.ownerUid).toBe("user-1");
    expect(rewritten.revision).toBe(3);
  });

  it("walks a book with no cover, no stash and no placements without complaint", async () => {
    const bare: ProjectPhotos = { sections: [{ id: "s1", items: [] } as unknown as Section] };
    expect(await collectProjectPhotoUrls(bare)).toEqual([]);
    const rewritten = await mapProjectPhotoUrls(bare, (url) => `moved:${url}`);
    expect(rewritten.sections).toHaveLength(1);
    expect(rewritten.stashedCookbook).toBeUndefined();
  });
});
