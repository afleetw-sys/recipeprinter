import { describe, expect, it } from "vitest";
import type { ImportMethod } from "@/types/recipe";
import { bookRecipeImage } from "@/lib/bookPhotos";

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
