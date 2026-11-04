// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoHoverHint } from "@/components/print/PhotoHoverHint";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// Every photo the deck opens a picker from (PHOTO_SURFACES in PrintDeck).
const SURFACES = [
  ".recipe-card__photo",
  ".recipe-card--chapter-with-photo .recipe-card__chapter-photo",
  ".recipe-card__cover-photo",
  ".recipe-image-spread__photo",
  ".photo-placeholder",
].join(", ");

/** A photo of the given kind on the page being worked on. */
function photoOnActivePage(html: string) {
  const page = document.createElement("div");
  page.className = "recipe-page-slide is-active";
  page.innerHTML = html;
  document.body.appendChild(page);
  return page.querySelector<HTMLElement>("[data-photo]")!;
}

function hover(target: Element) {
  act(() => {
    // jsdom has no PointerEvent: a mouse event that says it is a mouse.
    const event = new MouseEvent("pointerover", { bubbles: true, buttons: 0 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    target.dispatchEvent(event);
  });
}

describe("The Change photo overlay", () => {
  // It showed over every photo, full-page ones included, and stayed over a
  // full-page photo the whole time the mouse was on it. It is for a recipe's
  // in-page photo only: the small one that otherwise reads as part of the
  // card. Full-page photos, chapter photos and covers get nothing.
  for (const [kind, html, shown] of [
    ["a recipe's in-page photo", '<span class="recipe-card__photo" data-photo><img /></span>', true],
    ["a recipe's full-page photo", '<div class="recipe-image-spread__photo" data-photo></div>', false],
    [
      "a chapter's photo",
      '<div class="recipe-card--chapter-with-photo"><div class="recipe-card__chapter-photo" data-photo></div></div>',
      false,
    ],
    ["a cover's photo", '<div class="recipe-card__cover-photo" data-photo></div>', false],
  ] as const) {
    it(`${shown ? "shows" : "does not show"} over ${kind}`, () => {
      render(<PhotoHoverHint surfaces={SURFACES} />);
      hover(photoOnActivePage(html));
      expect(Boolean(document.querySelector(".photo-hover-hint"))).toBe(shown);
    });
  }
});
