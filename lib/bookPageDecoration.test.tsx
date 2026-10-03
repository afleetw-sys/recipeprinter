// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CoverFace,
  DividerFace,
  RecipeCardFace,
  TableOfContentsFace,
} from "@/components/RecipeCardPrint";
import { RECIPE_PRINT_TEMPLATE_OPTIONS } from "@/lib/printTemplates";
import type { CoverConfig, Recipe, RecipePrintTemplate } from "@/types/recipe";

// A cookbook used to stamp its theme's decoration on every page: the opening
// page, the contents, each chapter opener, every recipe page and every page a
// recipe ran onto. A book in Garden carried the same tomato vine on all of
// them. The rule now follows each page's job:
//
//   - a recipe's first page carries the whole decoration;
//   - a page a recipe runs onto keeps the theme's EDGE (a spine, a frame, a
//     strip, ruled paper, a top bar) so the recipe still reads as one piece,
//     but drops the illustration;
//   - the opening page, the contents and the chapter openers carry none;
//   - the back cover carries the whole decoration, as the book's closing page.
//
// Recipe cards (not a book) are untouched: every face keeps everything.

/** Each themed piece, sorted into the illustration and the edge. */
const PIECES: Partial<Record<RecipePrintTemplate, { art: string[]; edge: string[] }>> = {
  garden: { art: [".recipe-card__garden-band", ".recipe-card__garden-tomatoes"], edge: [] },
  christmas: { art: [".recipe-card__christmas-hats"], edge: [] },
  market: { art: [".recipe-card__market-band"], edge: [".recipe-card__market-bar"] },
  bistro: { art: [], edge: [".recipe-card__checker"] },
  counter: { art: [], edge: [".recipe-card__counter-band"] },
  pantry: { art: [], edge: [".recipe-card__pantry-rules"] },
  quilt: { art: [], edge: [".recipe-card__quilt"] },
  poster: { art: [], edge: [".recipe-card__poster-band", ".recipe-card__poster-frame"] },
  supper: { art: [], edge: [".recipe-card__supper-frame", ".recipe-card__supper-utensil"] },
};

const recipe: Recipe = {
  title: "Soup",
  ingredients: [{ raw: "1 onion" }],
  instructions: [{ step: 1, text: "Cook it." }],
} as Recipe;

function cover(template: RecipePrintTemplate): CoverConfig {
  return { title: "Family Table", blurb: "Made with love.", template };
}

type Page = "recipe" | "continuation" | "card-continuation" | "opening" | "contents" | "chapter" | "back-cover";

function renderPage(page: Page, template: RecipePrintTemplate) {
  const recipeFace = (continued: boolean, cookbookMode: boolean) => (
    <RecipeCardFace
      recipe={recipe}
      ingredients={recipe.ingredients}
      instructions={recipe.instructions}
      side="front"
      showHeader={!continued}
      layout="standard"
      hasBackFace={false}
      continued={continued}
      template={template}
      cookbookMode={cookbookMode}
    />
  );
  switch (page) {
    case "recipe":
      return render(recipeFace(false, true));
    case "continuation":
      return render(recipeFace(true, true));
    case "card-continuation":
      return render(recipeFace(true, false));
    case "opening":
      return render(<CoverFace cover={cover(template)} side="dedication" template={template} />);
    // The contents and chapter openers no longer take a theme at all: there is
    // nothing themed on them to draw. Rendered inside the theme's wrapper so a
    // regression that hands them one again would show here.
    case "contents":
      return render(
        <div className={`recipe-template--${template}`}>
          <TableOfContentsFace entries={[]} />
        </div>,
      );
    case "chapter":
      return render(
        <div className={`recipe-template--${template}`}>
          <DividerFace title="Weeknight Suppers" />
        </div>,
      );
    case "back-cover":
      return render(<CoverFace cover={cover(template)} side="back" template={template} />);
  }
}

function shown(container: HTMLElement, selectors: string[]) {
  return selectors.filter((selector) => container.querySelector(selector));
}

afterEach(cleanup);

describe("which decoration each cookbook page carries", () => {
  it("knows the pieces of every theme that has a decoration layer", () => {
    // A new decorated theme has to be sorted into art and edge here, or the
    // rule below silently skips it.
    for (const { id } of RECIPE_PRINT_TEMPLATE_OPTIONS) {
      const { container } = renderPage("recipe", id);
      const known = PIECES[id];
      const all = known ? [...known.art, ...known.edge] : [];
      const decorated = container.querySelectorAll(
        "[class*='recipe-card__'][aria-hidden]:not(.recipe-card__accent)",
      );
      const unknown = Array.from(decorated).filter(
        (el) => !all.some((selector) => el.matches(selector)) && el.closest("svg") === null,
      );
      expect(unknown.map((el) => `${id}: ${el.className}`)).toEqual([]);
      cleanup();
    }
  });

  for (const [template, { art, edge }] of Object.entries(PIECES) as Array<
    [RecipePrintTemplate, { art: string[]; edge: string[] }]
  >) {
    describe(template, () => {
      it("puts the whole decoration on a recipe's first page", () => {
        const { container } = renderPage("recipe", template);
        expect(shown(container, [...art, ...edge])).toEqual([...art, ...edge]);
      });

      it("keeps only the edge on a page a recipe runs onto", () => {
        const { container } = renderPage("continuation", template);
        expect(shown(container, [...art, ...edge])).toEqual(edge);
      });

      it("leaves a recipe card's later faces alone outside a book", () => {
        const { container } = renderPage("card-continuation", template);
        expect(shown(container, [...art, ...edge])).toEqual([...art, ...edge]);
      });

      for (const page of ["opening", "contents", "chapter"] as const) {
        it(`puts none of it on the ${page} page`, () => {
          const { container } = renderPage(page, template);
          expect(shown(container, [...art, ...edge])).toEqual([]);
        });
      }

      it("keeps the illustration on the back cover", () => {
        // Bistro's back cover has its own checker band (the cover band), not
        // the recipe spine, so it has no illustration to check here.
        const { container } = renderPage("back-cover", template);
        expect(shown(container, art)).toEqual(art);
      });
    });
  }
});
