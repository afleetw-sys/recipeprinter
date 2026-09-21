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

const renderDedication = (patch: Partial<CoverConfig>) =>
  renderToStaticMarkup(
    <CoverFace
      cover={{ title: "Dedication", template: "bistro", ...patch }}
      side="dedication"
      template="bistro"
      showDecoration={false}
    />,
  );

describe("the opening page's full-page photo", () => {
  it("prints its text by default, with no photo chosen", () => {
    const html = renderDedication({ blurb: "For the ones who taught us." });
    expect(html).toContain("For the ones who taught us.");
    expect(html).toContain("recipe-card__cover-dedication-label");
    expect(html).not.toContain("recipe-card__cover-image");
  });

  it("replaces the text entirely once a photo is chosen", () => {
    const html = renderDedication({
      layout: "photo",
      imageUrl: "https://example.com/a.jpg",
      blurb: "For the ones who taught us.",
      author: "— The Smiths",
    });
    expect(html).toContain("recipe-card__cover-image");
    expect(html).toContain("https://example.com/a.jpg");
    // The words are still in the data (so turning the photo back off hands
    // them back), but none of them are on the page.
    expect(html).not.toContain("For the ones who taught us.");
    expect(html).not.toContain("The Smiths");
    expect(html).not.toContain("recipe-card__cover-dedication-label");
  });

  it("prints a collage the same way", () => {
    const html = renderDedication({ layout: "collage", gridImages: ["a.jpg", "b.jpg"] });
    expect(html).toContain("recipe-card__cover-grid-cell");
    expect(html).toContain("recipe-card__cover-photo--grid");
    expect(html).not.toContain("recipe-card__cover-dedication-label");
  });

  it("falls back to text when the layout is set back to typographic, even with a photo still on file", () => {
    // Turning the photo off in the picker clears imageUrl in practice, but the
    // layout flag is what actually decides the render — a stray URL left
    // behind must not resurrect the photo page.
    const html = renderDedication({
      layout: "typographic",
      imageUrl: "https://example.com/a.jpg",
      blurb: "For the ones who taught us.",
    });
    expect(html).not.toContain("recipe-card__cover-image");
    expect(html).toContain("For the ones who taught us.");
  });
});
