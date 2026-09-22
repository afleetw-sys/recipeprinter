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

describe("the opening page's photo", () => {
  it("prints its text by default, with no photo chosen", () => {
    const html = renderDedication({ blurb: "For the ones who taught us." });
    expect(html).toContain("For the ones who taught us.");
    expect(html).toContain("recipe-card__cover-dedication-label");
    expect(html).not.toContain("recipe-card__cover-image");
  });

  it("sits behind the words rather than replacing them", () => {
    const html = renderDedication({
      layout: "photo",
      imageUrl: "https://example.com/a.jpg",
      blurb: "For the ones who taught us.",
      author: "— The Smiths",
    });
    expect(html).toContain("recipe-card__cover-image");
    expect(html).toContain("https://example.com/a.jpg");
    // Choosing a photo is a background choice, not an instruction to delete
    // what was written — both the photo and every line are on the page.
    expect(html).toContain("For the ones who taught us.");
    expect(html).toContain("The Smiths");
    expect(html).toContain("recipe-card__cover-dedication-label");
  });

  it("prints a collage the same way, words still on top of it", () => {
    const html = renderDedication({
      layout: "collage",
      gridImages: ["a.jpg", "b.jpg"],
      blurb: "For the ones who taught us.",
    });
    expect(html).toContain("recipe-card__cover-grid-cell");
    expect(html).toContain("recipe-card__cover-photo--grid");
    expect(html).toContain("For the ones who taught us.");
  });

  it("falls back to paper when the layout is set back to typographic, even with a photo still on file", () => {
    // Turning the photo off in the picker clears imageUrl in practice, but the
    // layout flag is what actually decides the render — a stray URL left
    // behind must not resurrect the photo.
    const html = renderDedication({
      layout: "typographic",
      imageUrl: "https://example.com/a.jpg",
      blurb: "For the ones who taught us.",
    });
    expect(html).not.toContain("recipe-card__cover-image");
    expect(html).toContain("For the ones who taught us.");
  });
});

describe("the opening page's lines, cleared one at a time", () => {
  it("prints nothing for a heading cleared on purpose, same as the body and signature already do", () => {
    const html = renderDedication({ title: "", blurb: "", author: "" });
    expect(html).not.toContain("recipe-card__cover-dedication-label");
    expect(html).not.toContain("recipe-card__cover-dedication-text");
    expect(html).not.toContain("recipe-card__cover-dedication-sign");
    expect(html).not.toMatch(/>Dedication</);
  });

  it("clears independently of whether a photo is set", () => {
    const html = renderDedication({
      title: "",
      blurb: "Still here.",
      layout: "photo",
      imageUrl: "https://example.com/a.jpg",
    });
    expect(html).toContain("recipe-card__cover-image");
    expect(html).not.toContain("recipe-card__cover-dedication-label");
    expect(html).toContain("Still here.");
  });

  it("doesn't leave an empty plate floating over the photo when every line is cleared", () => {
    // Regression: the plate CSS (print.css) paints for ANY photo/grid mode
    // regardless of whether `.cover-back-content` actually has children in
    // it — `data-cover-text="none"` is what hides the plate itself, and it
    // was only ever wired up for the plain back cover, not this page.
    const html = renderDedication({
      title: "",
      blurb: "",
      author: "",
      layout: "collage",
      gridImages: ["a.jpg", "b.jpg"],
    });
    expect(html).toContain("recipe-card__cover-grid-cell");
    expect(html).toContain('data-cover-text="none"');
  });
});

const renderBack = (patch: Partial<CoverConfig>) =>
  renderToStaticMarkup(
    <CoverFace cover={{ title: "", template: "bistro", ...patch }} side="back" template="bistro" showDecoration={false} />,
  );

describe("the back cover's photo", () => {
  it("prints its text on plain paper by default, with no photo chosen", () => {
    const html = renderBack({ blurb: "From our table to yours." });
    expect(html).toContain("From our table to yours.");
    expect(html).toContain("recipe-card__cover-photo--paper");
    expect(html).not.toContain("recipe-card__cover-image");
  });

  it("sits behind the words rather than replacing them, same as the front cover", () => {
    const html = renderBack({
      layout: "photo",
      imageUrl: "https://example.com/a.jpg",
      blurb: "From our table to yours.",
      author: "The Smiths",
    });
    expect(html).toContain("recipe-card__cover-image");
    expect(html).toContain("https://example.com/a.jpg");
    expect(html).toContain("From our table to yours.");
    expect(html).toContain("The Smiths");
    // No bottom-weighted scrim: the back cover's text is centered, not
    // anchored to a bottom title lockup — see print.css.
    expect(html).not.toContain("recipe-card__cover-scrim");
  });

  it("prints a collage the same way", () => {
    const html = renderBack({
      layout: "collage",
      gridImages: ["a.jpg", "b.jpg"],
      blurb: "From our table to yours.",
    });
    expect(html).toContain("recipe-card__cover-grid-cell");
    expect(html).toContain("recipe-card__cover-photo--grid");
    expect(html).toContain("From our table to yours.");
  });

  it("falls back to paper when the layout is set back to typographic, even with a photo still on file", () => {
    const html = renderBack({
      layout: "typographic",
      imageUrl: "https://example.com/a.jpg",
      blurb: "From our table to yours.",
    });
    expect(html).not.toContain("recipe-card__cover-image");
    expect(html).toContain("From our table to yours.");
  });

  it("clears each line independently of whether a photo is set", () => {
    const html = renderBack({
      blurb: "",
      author: "",
      layout: "photo",
      imageUrl: "https://example.com/a.jpg",
    });
    expect(html).toContain("recipe-card__cover-image");
    expect(html).not.toContain("recipe-card__cover-blurb");
    expect(html).not.toContain("recipe-card__cover-from");
  });
});
