import { beforeEach, describe, expect, it } from "vitest";
import { materializeProjectPhotos } from "@/lib/photoStorage";
import type { RecipePagePlacement, Section, StashedCookbook } from "@/types/recipe";

/* Every field of a book that can hold a photo has to be swept before the book
 * is written to Firestore or handed to the server-side renderer, because a
 * browser-local image is a string that LOOKS like a URL and then resolves to
 * nothing anywhere else. Three were missed: a chapter collage, whose default is
 * the chapter's own recipe photos; a recipe's photo history, which holds the
 * images a later pick replaced; and a whole book set aside behind a card job.
 *
 * The sweep also has to report what it moved. It reads from the working copy
 * and hands its result to the SAVE, so without that record the working copy
 * keeps its `blob:` URLs and every later save re-uploads the same bytes.
 *
 * The uploader is injected rather than mocked (see `MaterializeUrl`): the real
 * one reaches Firebase Storage through a dynamic import, and standing that up
 * would make a test about WHICH FIELDS get swept depend on the Storage SDK. */

const REMOTE = "https://cdn.example.com/already/there.jpg";
const isUploaded = (url: string | undefined) => Boolean(url?.startsWith("https://storage.example/"));

/** Stands in for the Storage upload: browser-local URLs move, everything else
    passes through untouched, exactly as `materializeOrKeep` behaves. */
let asked: string[] = [];
const upload = async (value: string | undefined) => {
  if (!value || !(value.startsWith("blob:") || value.startsWith("data:"))) return value;
  asked.push(value);
  return `https://storage.example/${value.replace(/^blob:/, "")}`;
};

/** The real one's failure mode: an upload that throws keeps the original, so
    one broken photo costs a picture rather than the whole save. */
const uploadFails = async (value: string | undefined) => value;

beforeEach(() => {
  asked = [];
});

function section(overrides: Partial<Section> = {}): Section {
  return { id: "s1", title: "Breads", items: [], ...overrides } as Section;
}

describe("sweeping a book's photos before it leaves the browser", () => {
  it("uploads a chapter collage, which defaults to the chapter's own photos", async () => {
    const { photos } = await materializeProjectPhotos(
      { sections: [section({ gridImages: ["blob:one", "blob:two", REMOTE] })] },
      upload,
    );
    const grid = photos.sections[0]!.gridImages!;
    expect(grid.slice(0, 2).every(isUploaded)).toBe(true);
    // A photo already in Storage is left exactly as it is.
    expect(grid[2]).toBe(REMOTE);
  });

  it("uploads the photos a recipe has worn before, so 'put the old one back' works", async () => {
    const itemPlacements: Record<string, RecipePagePlacement> = {
      r1: { heroImageUrl: "blob:hero", photoHistory: ["blob:previous", REMOTE] },
    };
    const { photos } = await materializeProjectPhotos({ sections: [], itemPlacements }, upload);
    expect(isUploaded(photos.itemPlacements!.r1.heroImageUrl)).toBe(true);
    expect(isUploaded(photos.itemPlacements!.r1.photoHistory![0])).toBe(true);
    expect(photos.itemPlacements!.r1.photoHistory![1]).toBe(REMOTE);
  });

  it("sweeps a book that has been set aside as well as the live one", async () => {
    const stashedCookbook: StashedCookbook = {
      cover: { title: "Our Favorites", template: "heirloom", imageUrl: "blob:cover" },
      sections: [
        { id: "s1", title: "Mains", itemIds: ["r1"], photoUrl: "blob:opener", gridImages: ["blob:tile"] },
      ],
      itemPlacements: { r1: { heroImageUrl: "blob:hero" } },
    };
    const { photos } = await materializeProjectPhotos({ sections: [], stashedCookbook }, upload);
    const stash = photos.stashedCookbook!;
    expect(isUploaded(stash.cover!.imageUrl)).toBe(true);
    expect(isUploaded(stash.sections[0]!.photoUrl)).toBe(true);
    expect(isUploaded(stash.sections[0]!.gridImages![0])).toBe(true);
    expect(isUploaded(stash.itemPlacements!.r1.heroImageUrl)).toBe(true);
  });

  it("reports which recipe photos moved, keyed by the queue item holding them", async () => {
    const { photos, uploadedRecipeImages } = await materializeProjectPhotos(
      {
        sections: [
          section({
            items: [
              { id: "r1", recipe: { title: "Sourdough", image: "blob:one" } },
              { id: "r2", recipe: { title: "Focaccia", image: REMOTE } },
              { id: "r3", recipe: { title: "Rye" } },
            ] as Section["items"],
          }),
        ],
      },
      upload,
    );
    // Only the one that actually stopped being browser-local.
    expect(Array.from(uploadedRecipeImages.keys())).toEqual(["r1"]);
    expect(isUploaded(uploadedRecipeImages.get("r1"))).toBe(true);
    expect(photos.sections[0]!.items[0]!.recipe!.image).toBe(uploadedRecipeImages.get("r1"));
  });

  it("does not report an upload that failed, so the local copy stays the source", async () => {
    const { photos, uploadedRecipeImages } = await materializeProjectPhotos(
      {
        sections: [
          section({
            items: [{ id: "r1", recipe: { title: "Sourdough", image: "blob:one" } }] as Section["items"],
          }),
        ],
      },
      uploadFails,
    );
    expect(uploadedRecipeImages.size).toBe(0);
    // Kept rather than blanked: one broken photo beats a blocked save.
    expect(photos.sections[0]!.items[0]!.recipe!.image).toBe("blob:one");
  });

  /* `localPhotoId` is the id of the bytes in IndexedDB — the only thing that
     can rebuild a photo whose `blob:` URL died with the document that minted
     it. Dropping it is right once the photo is in Storage and WRONG until then:
     a failed upload used to keep the dead URL and lose the way back to the
     bytes, so the one case where the local copy still mattered was the one case
     that threw it away. */
  it("keeps the way back to a photo whose upload failed", async () => {
    const item = { id: "r1", localPhotoId: "idb-1", recipe: { title: "Sourdough", image: "blob:one" } };
    const { photos } = await materializeProjectPhotos(
      { sections: [section({ items: [item] as Section["items"] })] },
      uploadFails,
    );
    expect(photos.sections[0]!.items[0]!.localPhotoId).toBe("idb-1");
  });

  it("forgets the local copy once the photo is really in Storage", async () => {
    const item = { id: "r1", localPhotoId: "idb-1", recipe: { title: "Sourdough", image: "blob:one" } };
    const { photos } = await materializeProjectPhotos(
      { sections: [section({ items: [item] as Section["items"] })] },
      upload,
    );
    // Left in place, a later hydration would replace a real Storage URL with a
    // browser-only one.
    expect(photos.sections[0]!.items[0]!.localPhotoId).toBeUndefined();
    expect(isUploaded(photos.sections[0]!.items[0]!.recipe!.image)).toBe(true);
  });

  it("is a no-op for a book whose photos are already in Storage", async () => {
    await materializeProjectPhotos(
      {
        sections: [
          section({
            gridImages: [REMOTE],
            items: [{ id: "r1", recipe: { title: "Sourdough", image: REMOTE } }] as Section["items"],
          }),
        ],
        cover: { title: "Our Favorites", template: "heirloom", imageUrl: REMOTE },
        itemPlacements: { r1: { heroImageUrl: REMOTE, photoHistory: [REMOTE] } },
      },
      upload,
    );
    // The point of pointing the working copy at Storage after a save: the next
    // save finds nothing left to send.
    expect(asked).toEqual([]);
  });
});
