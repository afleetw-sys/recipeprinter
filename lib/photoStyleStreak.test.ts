import { describe, expect, it } from "vitest";
import { PHOTO_STREAK_THRESHOLD, recordPhotoChoice, shouldOfferBookPhotoStyle, type PhotoStyleStreak } from "@/lib/photoStyleStreak";

function pick(ids: string[], mode: "none" | "card" | "full", start: PhotoStyleStreak | null = null) {
  return ids.reduce<PhotoStyleStreak | null>((streak, id) => recordPhotoChoice(streak, id, mode), start)!;
}

describe("photo style streak", () => {
  it("offers the book-wide control after five different recipes get the same layout", () => {
    const streak = pick(["a", "b", "c", "d", "e"], "card");
    expect(PHOTO_STREAK_THRESHOLD).toBe(5);
    expect(shouldOfferBookPhotoStyle(streak, 10)).toBe(true);
  });

  it("does not offer it after four", () => {
    expect(shouldOfferBookPhotoStyle(pick(["a", "b", "c", "d"], "card"), 10)).toBe(false);
  });

  it("does not count the same recipe twice", () => {
    expect(shouldOfferBookPhotoStyle(pick(["a", "a", "b", "b", "c"], "card"), 10)).toBe(false);
  });

  it("starts over when a different layout is picked", () => {
    const mixed = recordPhotoChoice(pick(["a", "b", "c", "d"], "card"), "e", "full");
    expect(mixed).toEqual({ mode: "full", recipeIds: ["e"] });
  });

  it("stays quiet when nothing is left to change", () => {
    expect(shouldOfferBookPhotoStyle(pick(["a", "b", "c", "d", "e"], "card"), 0)).toBe(false);
  });
});
