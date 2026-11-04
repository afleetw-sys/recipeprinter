// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeCustomizePanel } from "@/components/print/ThemeCustomizePanel";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const PARTS = ["title", "notes", "details", "ingredients-headings", "ingredients", "steps-headings", "steps"];

describe("Customize theme's Fine-tune sizes rows", () => {
  // A part set off its default on a free recipe card gets a crown. The crown
  // was a third child of the row, which spreads its children across its
  // width, so the crown landed at the panel's edge and pulled that row's
  // dropdown away from the others. Each row is its name and one control, the
  // crown going with the dropdown, for every part and whether or not it is
  // marked.
  for (const proMarked of [false, true]) {
    it(`keeps each row to a name and its control (${proMarked ? "crowned" : "plain"})`, () => {
      // The parts as a recipe page draws them: a row shows once its part is on
      // the page.
      const page = document.createElement("div");
      page.className = "recipe-page-canvas";
      for (const part of PARTS) {
        const node = document.createElement("p");
        node.dataset.elementPage = "recipe:r1";
        node.dataset.element = part;
        node.textContent = part;
        page.appendChild(node);
      }
      document.body.appendChild(page);

      const sizes = Object.fromEntries(PARTS.map((part) => [part, { textSize: 1.25 }]));
      const { container } = render(
        <ThemeCustomizePanel
          cookbook={false}
          proMarked={proMarked}
          photosShown={false}
          fontScale={1}
          setFontScale={() => {}}
          photoScale={1}
          setPhotoScale={() => {}}
          customized
          onReset={() => {}}
          onBack={() => {}}
          recipePartSizes={sizes}
          setRecipePartSize={() => {}}
        />,
      );

      const rows = Array.from(container.querySelectorAll(".recipe-customize__part-row"));
      expect(rows).toHaveLength(PARTS.length);
      for (const row of rows) {
        expect(row.children).toHaveLength(2);
        const control = row.children[1];
        expect(control.matches(".recipe-text-toolbar__size") || Boolean(control.querySelector(".recipe-text-toolbar__size"))).toBe(true);
        expect(Boolean(control.querySelector(".pro-badge"))).toBe(proMarked);
      }
    });
  }
});
