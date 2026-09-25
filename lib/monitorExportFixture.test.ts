import { describe, expect, it } from "vitest";
import fixture from "@/monitoring/export-fixture.json";
import { COOKBOOK_PRESETS } from "@/lib/cookbookPresets";

/**
 * `monitoring/export-fixture.json` is the book the daily production monitor
 * (a separate, private repo) downloads from this repo's production branch and
 * sends straight to the cookbook PDF renderer. It lives here, beside the export
 * code, so a change that would break it fails this repo's CI instead of the
 * monitor's next morning run.
 */
describe("production monitor export fixture", () => {
  it("names a format the renderer knows", () => {
    expect(COOKBOOK_PRESETS.map((preset) => preset.id)).toContain(fixture.preset);
  });

  it("asks for a health check, so the render never lands in Storage", () => {
    expect(fixture.healthCheck).toBe(true);
  });

  it("references no URLs at all, so the render fetches nothing and needs no photo", () => {
    expect(JSON.stringify(fixture)).not.toMatch(/https?:|blob:|data:/i);
  });

  it("is a cookbook whose every recipe has something to print", () => {
    expect(fixture.project.kind).toBe("cookbook");
    const items = fixture.project.sections.flatMap((section) => section.items);
    expect(items.length).toBeGreaterThan(0);
    for (const { recipe } of items) {
      expect(recipe.ingredients.length + recipe.instructions.length).toBeGreaterThan(0);
    }
  });
});
