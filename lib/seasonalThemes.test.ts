import { describe, expect, it } from "vitest";
import { arrangeThemes, isInSeason } from "@/lib/seasonalThemes";

const day = (month: number, date: number) => new Date(2026, month - 1, date);

describe("isInSeason", () => {
  const christmas = { from: "11-01", to: "12-31" };

  it("is in season on its first and last days", () => {
    expect(isInSeason(christmas, day(11, 1))).toBe(true);
    expect(isInSeason(christmas, day(12, 31))).toBe(true);
  });

  it("is out of season the day either side", () => {
    expect(isInSeason(christmas, day(10, 31))).toBe(false);
    expect(isInSeason(christmas, day(1, 1))).toBe(false);
  });

  it("wraps over New Year when the window ends before it starts", () => {
    const holidays = { from: "12-15", to: "01-05" };
    expect(isInSeason(holidays, day(12, 20))).toBe(true);
    expect(isInSeason(holidays, day(1, 3))).toBe(true);
    expect(isInSeason(holidays, day(1, 6))).toBe(false);
    expect(isInSeason(holidays, day(12, 14))).toBe(false);
  });
});

describe("arrangeThemes", () => {
  const themes = [
    { id: "classic" },
    { id: "pantry" },
    { id: "typewriter", pro: true },
    { id: "christmas", pro: true, season: { from: "11-01", to: "12-31" } },
    { id: "bistro", pro: true },
  ];
  const isPremium = (theme: { pro?: boolean }) => Boolean(theme.pro);

  it("features an in-season theme at the top of the Pro themes", () => {
    const { main, offSeason } = arrangeThemes(themes, isPremium, day(12, 1));
    expect(main.map((t) => t.id)).toEqual(["classic", "pantry", "christmas", "typewriter", "bistro"]);
    expect(offSeason).toEqual([]);
  });

  it("moves an out-of-season theme out of the main grid", () => {
    const { main, offSeason } = arrangeThemes(themes, isPremium, day(7, 1));
    expect(main.map((t) => t.id)).toEqual(["classic", "pantry", "typewriter", "bistro"]);
    expect(offSeason.map((t) => t.id)).toEqual(["christmas"]);
  });
});
