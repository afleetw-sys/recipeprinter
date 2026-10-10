import { describe, expect, test } from "vitest";
import { bookRoomLeft, fitBookRoom } from "@/lib/cookbookFreeSize";

// The free preview size: who it caps, and by how much (docs/import-meter-plan.md, 3.2).
describe("a cookbook's free preview size", () => {
  const unbought = { cookbookMode: true, locked: true, live: true, cap: 10 };

  test.each([
    { name: "an unbought book with room", input: { ...unbought, recipeCount: 9 }, room: 1 },
    { name: "an unbought book that is full", input: { ...unbought, recipeCount: 10 }, room: 0 },
    { name: "an older book already over the cap keeps its recipes; only adding is gated", input: { ...unbought, recipeCount: 175 }, room: 0 },
    { name: "a bought book, at any size", input: { ...unbought, locked: false, recipeCount: 175 }, room: null },
    { name: "a card project", input: { ...unbought, cookbookMode: false, recipeCount: 40 }, room: null },
    { name: "any book while the allowance isn't live", input: { ...unbought, live: false, recipeCount: 40 }, room: null },
  ])("$name", ({ input, room }) => {
    expect(bookRoomLeft(input)).toBe(room);
  });

  test("recipes that arrive together keep only what fits, in order", () => {
    expect(fitBookRoom(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(fitBookRoom(["a", "b", "c"], 0)).toEqual([]);
    expect(fitBookRoom(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
  });
});
