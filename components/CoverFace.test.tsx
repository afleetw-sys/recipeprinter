import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoverFace } from "@/components/RecipeCardPrint";
import type { CoverConfig } from "@/types/recipe";

const cover = (patch: Partial<CoverConfig>): CoverConfig => ({
  title: "Our Favorite Recipes",
  template: "bistro",
  layout: "collage",
  gridImages: ["a.jpg", "b.jpg"],
  ...patch,
});

const render = (patch: Partial<CoverConfig>, showEmptyFields = false) =>
  renderToStaticMarkup(
    <CoverFace cover={cover(patch)} side="front" template="bistro" showDecoration={false} showEmptyFields={showEmptyFields} />,
  );

describe("the front cover's text lockup", () => {
  it("is marked as having no text when every line is empty", () => {
    expect(render({ title: "" })).toContain('data-cover-text="none"');
  });

  it("counts whitespace as empty", () => {
    expect(render({ title: "  ", subtitle: " " })).toContain('data-cover-text="none"');
  });

  it("is not marked while any one line has text", () => {
    expect(render({ title: "", author: "The Smiths" })).not.toContain("data-cover-text");
    expect(render({ title: "", edition: "2026" })).not.toContain("data-cover-text");
    expect(render({})).not.toContain("data-cover-text");
  });

  it("keeps the photo and the top accent band", () => {
    const html = render({ title: "" });
    expect(html).toContain("recipe-card__cover-grid-cell");
    expect(html).toContain("recipe-card__cover-band");
  });
});
