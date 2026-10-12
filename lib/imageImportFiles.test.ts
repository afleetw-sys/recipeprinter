import { describe, expect, it } from "vitest";
import { partitionImageFiles } from "@/lib/imageImport";

// Every photo box (Add recipes, the landing pages, the recipe photo picker,
// Add yours) sorts what it was handed through this one call. Phones hand back
// photos without a usable type: iPhone HEIC often arrives with an empty type or
// as a generic binary, and some Android pickers send no type at all. Turning
// those away reads as "the photo import is broken".

const file = (name: string, type: string) => new File(["x"], name, { type });
const sort = (files: File[]) => partitionImageFiles(files as unknown as FileList);

describe("which picked files count as photos", () => {
  it("keeps every photo a phone can hand over, and turns away only what plainly isn't one", () => {
    const photos = [
      file("IMG_0001.jpg", "image/jpeg"),
      file("IMG_0002.HEIC", ""),
      file("IMG_0003.heic", "application/octet-stream"),
      file("IMG_0004.heif", "image/heif"),
      file("IMG_0005.HEIC", "image/heic"),
      file("Screenshot.png", "image/png"),
      file("from-a-picker", ""),
    ];
    const notPhotos = [file("recipe.pdf", "application/pdf"), file("notes.txt", "text/plain")];

    const { images, rejected } = sort([...photos, ...notPhotos]);
    expect(images.map((f) => f.name)).toEqual(photos.map((f) => f.name));
    expect(rejected).toBe(notPhotos.length);
    expect(sort([])).toEqual({ images: [], rejected: 0 });
  });
});
