import { describe, expect, it } from "vitest";
import { photoSizeOffered } from "@/lib/themeLooks";

/**
 * Customize theme's photo size is there whenever the book has photos, whatever
 * its Photos choice is. A cookbook with photos on Full page, or on None with
 * some recipes set in page one by one, showed no photo size at all, and
 * switching the book to In page was the only way to find it (Amelia,
 * 2026-11-04).
 */
describe("photoSizeOffered", () => {
  it("is offered once the book has photos, cookbook or cards", () => {
    for (const cookbookMode of [true, false]) {
      expect(photoSizeOffered({ cookbookMode, cardPhotosAllowed: true, hasPhotos: true })).toBe(true);
    }
  });

  it("isn't offered without photos, or on cards that can't have them", () => {
    for (const cookbookMode of [true, false]) {
      expect(photoSizeOffered({ cookbookMode, cardPhotosAllowed: true, hasPhotos: false })).toBe(false);
    }
    expect(photoSizeOffered({ cookbookMode: false, cardPhotosAllowed: false, hasPhotos: true })).toBe(false);
  });
});
