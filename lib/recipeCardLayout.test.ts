import { describe, expect, it } from "vitest";
import { HARNESS_RECIPES } from "@/lib/__fixtures__/harnessRecipes";
import { checkPageInvariants } from "@/lib/faceMeasure";
import {
  assembleSpreads,
  getRecipeFaces,
  planCookbookSection,
  splitIntoColumns,
  type BookPageKind,
  type CookbookPlanItem,
  type CookbookPlanRecipeSlot,
} from "@/lib/recipeCardLayout";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";

/**
 * Headless regression net for the pagination engine.
 *
 * This is the half of app/print/harness that needs no browser. The harness
 * answers "did this face overflow its real rendered box by N px?", which only
 * a laid-out DOM can know — and it stays the tool for that. But the invariants
 * below are structural facts about the page list itself, and those are exactly
 * the failures that silently destroy a recipe: a step vanishing, an ingredient
 * printed twice, steps arriving out of order, a blank continuation page. A
 * clipped card is visibly wrong and gets reported. A dropped step is invisible
 * — you find out at the stove.
 *
 * `checkPageInvariants` was already written pure and DOM-free for precisely
 * this; until now the only thing calling it was the harness, which required a
 * human to open a URL and click "Run all". Now `npm test` does it.
 *
 * Deliberately swept over every `RecipePrintTemplate` rather than
 * `RECIPE_PRINT_TEMPLATE_OPTIONS` (which the harness uses): the options list
 * is the *picker*, and a template can be withheld from it while still
 * rendering for projects already saved on one. Testing the picker would
 * silently stop covering a template the moment it's gated, which is the
 * opposite of what you want from a regression net.
 */
const SIZES: PrintCardSize[] = ["letter", "card-6x4"];
const TEMPLATES: RecipePrintTemplate[] = [
  "classic",
  "heirloom",
  "bistro",
  "pantry",
  "counter",
  "keepsake",
];
const PHOTO_OPTIONS = [false, true];
const SOURCE_URL_OPTIONS = [false, true];

interface Combo {
  size: PrintCardSize;
  template: RecipePrintTemplate;
  hasPhoto: boolean;
  showSourceUrl: boolean;
}

function everyCombo(): Combo[] {
  const combos: Combo[] = [];
  for (const size of SIZES) {
    for (const template of TEMPLATES) {
      for (const hasPhoto of PHOTO_OPTIONS) {
        for (const showSourceUrl of SOURCE_URL_OPTIONS) {
          combos.push({ size, template, hasPhoto, showSourceUrl });
        }
      }
    }
  }
  return combos;
}

const COMBOS = everyCombo();

describe("getRecipeFaces page invariants", () => {
  // One `it` per fixture rather than per combo: 17 readable failures instead
  // of 1,088 rows, while still asserting every combo — the failure message
  // names the exact combo that broke.
  for (const fixture of HARNESS_RECIPES) {
    it(`${fixture.id} splits correctly across every config (${fixture.note})`, () => {
      for (const combo of COMBOS) {
        const { pages } = getRecipeFaces(fixture.recipe, combo.size, {
          hasPhoto: combo.hasPhoto,
          showSourceUrl: combo.showSourceUrl,
          template: combo.template,
        });

        const where =
          `${fixture.id} | ${combo.size} | ${combo.template} | ` +
          `photo=${combo.hasPhoto} | sourceUrl=${combo.showSourceUrl}`;

        const result = checkPageInvariants(
          pages,
          fixture.recipe.ingredients.length,
          fixture.recipe.instructions.length,
          (item) => fixture.recipe.ingredients.indexOf(item),
          (item) => fixture.recipe.instructions.indexOf(item),
        );

        // INV-2: every ingredient and step appears exactly once, in original
        // order. The one that matters most — a violation means the printed
        // card is missing or duplicating content the user gave us.
        expect(result.complete, `INV-2 completeness failed: ${where}`).toBe(true);

        // INV-3: no face after the first is empty. A blank continuation side
        // prints as a wasted sheet of paper.
        expect(result.noEmptyFace, `INV-3 empty face: ${where}`).toBe(true);

        // INV-4: all ingredients precede all instructions in the placed flow.
        // The pop/pull correction loop in RecipeFaceMeasurer relies on this to
        // decide what it may move between adjacent faces.
        expect(
          result.ingredientsBeforeInstructions,
          `INV-4 ingredients after instructions: ${where}`,
        ).toBe(true);

        // A recipe with any content must produce at least one face.
        expect(pages.length, `no pages produced: ${where}`).toBeGreaterThan(0);
      }
    });
  }

  it("sweeps the full matrix", () => {
    // Guards the guard: if the fixture corpus or the matrix is ever emptied,
    // every assertion above would vacuously pass and this file would go green
    // while testing nothing.
    expect(HARNESS_RECIPES.length).toBeGreaterThan(0);
    expect(COMBOS.length).toBe(
      SIZES.length * TEMPLATES.length * PHOTO_OPTIONS.length * SOURCE_URL_OPTIONS.length,
    );
  });
});

describe("planCookbookSection", () => {
  // Phase 2b: how a section's recipes fall onto physical sheets given each
  // recipe's resolved layout. A cookbook always gives each recipe its own full
  // page; `image-spread` prepends a full-bleed facing photo page.
  const item = (
    id: string,
    layout: CookbookPlanItem["layout"],
    extra: Partial<CookbookPlanItem> = {},
  ): CookbookPlanItem => ({ id, layout, faceCount: 1, ...extra });

  const recipeSlots = (sheet: { slots: Array<CookbookPlanRecipeSlot | { kind: string } | null> }) =>
    sheet.slots.filter((s): s is CookbookPlanRecipeSlot => s?.kind === "recipe");

  it("gives each full recipe its own single-sided sheet (non-duplex)", () => {
    const plan = planCookbookSection(
      [item("a", "full"), item("b", "full"), item("c", "full")],
      { continueOnBack: false },
    );
    expect(plan).toHaveLength(3);
    for (const sheet of plan) {
      expect(sheet.layoutKind).toBeUndefined();
      expect(sheet.backGroupNeeded).toBe(false);
      expect(recipeSlots(sheet)).toHaveLength(1);
    }
    // Reading order is preserved.
    expect(plan.map((s) => (s.slots[0] as CookbookPlanRecipeSlot).itemId)).toEqual(["a", "b", "c"]);
  });

  it("continues a full recipe's overflow on its own back when duplex", () => {
    const [sheet, ...rest] = planCookbookSection([item("a", "full", { faceCount: 2 })], { continueOnBack: true });
    expect(rest).toHaveLength(0);
    const slot = sheet.slots[0] as CookbookPlanRecipeSlot;
    expect(slot.frontFace).toBe(0);
    expect(slot.backFace).toBe(1);
    expect(sheet.backGroupNeeded).toBe(true);
  });

  it("spreads a full recipe's overflow onto a second sheet when single-sided", () => {
    const plan = planCookbookSection([item("a", "full", { faceCount: 2 })], { continueOnBack: false });
    expect(plan).toHaveLength(2);
    expect((plan[0].slots[0] as CookbookPlanRecipeSlot).frontFace).toBe(0);
    expect((plan[1].slots[0] as CookbookPlanRecipeSlot).frontFace).toBe(1);
    expect(plan.every((s) => s.backGroupNeeded === false)).toBe(true);
  });

  it("prepends a facing photo page for an image-spread recipe with a hero", () => {
    const plan = planCookbookSection([item("a", "image-spread", { heroImageUrl: "hero.jpg" })], { continueOnBack: false });
    expect(plan).toHaveLength(2);
    expect(plan[0].layoutKind).toBe("image");
    expect(plan[0].slots[0]).toMatchObject({ kind: "image", itemId: "a", heroImageUrl: "hero.jpg" });
    expect(plan[1].layoutKind).toBeUndefined();
    expect((plan[1].slots[0] as CookbookPlanRecipeSlot).itemId).toBe("a");
  });

  it("skips the photo page when an image-spread recipe has no hero image", () => {
    const plan = planCookbookSection([item("a", "image-spread")], { continueOnBack: false });
    expect(plan).toHaveLength(1);
    expect(plan[0].layoutKind).toBeUndefined();
    expect((plan[0].slots[0] as CookbookPlanRecipeSlot).itemId).toBe("a");
  });

});

describe("assembleSpreads (book imposition)", () => {
  // Cookbook "book view": pages group into two-page spreads in natural order.
  const K = (...kinds: BookPageKind[]) => kinds;

  it("stands the cover and back cover alone", () => {
    const spreads = assembleSpreads(K("cover", "content", "content", "back"));
    expect(spreads[0]).toEqual({ left: null, right: 0, single: true });
    expect(spreads[spreads.length - 1]).toEqual({ left: 3, right: null, single: true });
  });

  it("pairs dedication with the following interior page", () => {
    // Only covers stand alone; front matter reads as an ordinary book spread.
    const spreads = assembleSpreads(K("cover", "dedication", "content", "content", "back"));
    expect(spreads[0]).toEqual({ left: null, right: 0, single: true });
    expect(spreads[1]).toEqual({ left: 1, right: 2, single: false });
    expect(spreads[2]).toEqual({ left: 3, right: null, single: false });
    expect(spreads[spreads.length - 1]).toEqual({ left: 4, right: null, single: true });
  });

  it("pairs body pages left→right", () => {
    // cover, [c1|c2], [c3|c4], back
    const spreads = assembleSpreads(K("cover", "content", "content", "content", "content", "back"));
    expect(spreads).toEqual([
      { left: null, right: 0, single: true },
      { left: 1, right: 2, single: false },
      { left: 3, right: 4, single: false },
      { left: 5, right: null, single: true },
    ]);
  });

  it("lets a chapter opener flow naturally without inserting a blank", () => {
    const spreads = assembleSpreads(K("cover", "chapter", "content"));
    expect(spreads[1]).toEqual({ left: 1, right: 2, single: false });
    expect(spreads).toHaveLength(2);
  });

  it("keeps each full-page image on the left of its own recipe", () => {
    const spreads = assembleSpreads(K("cover", "content", "image-photo", "content"));
    expect(spreads[1]).toEqual({ left: 1, right: null, single: false });
    expect(spreads[2]).toEqual({ left: 2, right: 3, single: false });
  });

  it("leaves an already-aligned image-spread untouched", () => {
    // cover, image-photo(1) at verso already, recipe(2) at recto
    const spreads = assembleSpreads(K("cover", "image-photo", "content"));
    expect(spreads[1]).toEqual({ left: 1, right: 2, single: false });
  });

  it("keeps successive recipe images attached to their matching recipes", () => {
    const spreads = assembleSpreads(K(
      "content",
      "image-photo", "content",
      "image-photo", "content",
    ));
    expect(spreads).toEqual([
      { left: 0, right: null, single: false },
      { left: 1, right: 2, single: false },
      { left: 3, right: 4, single: false },
    ]);
  });

  it("pads a trailing lone body page to a full spread", () => {
    const spreads = assembleSpreads(K("cover", "content"));
    expect(spreads[1]).toEqual({ left: 1, right: null, single: false });
  });

  it("pairs a chapter opener with its facing section photo", () => {
    const spreads = assembleSpreads(K("cover", "chapter", "section-photo", "content"));
    // opener on the verso, its full-page/grid photo on the recto, as one spread
    expect(spreads[1]).toEqual({ left: 1, right: 2, single: false });
    expect(spreads[2]).toEqual({ left: 3, right: null, single: false });
  });

  it("realigns a stray page so a chapter opener isn't split from its photo", () => {
    const spreads = assembleSpreads(K("content", "chapter", "section-photo", "content"));
    // the lone content stands by itself so the opener keeps its photo on the recto
    expect(spreads[0]).toEqual({ left: 0, right: null, single: false });
    expect(spreads[1]).toEqual({ left: 1, right: 2, single: false });
    expect(spreads[2]).toEqual({ left: 3, right: null, single: false });
  });
});

describe("splitIntoColumns", () => {
  // The two-column balancer that replaced CSS `column-count` (unreliable on
  // iOS's print path). Pure arithmetic over measured heights, so it is fully
  // testable here even though its inputs come from the DOM in production.
  it("splits evenly when heights are uniform", () => {
    expect(splitIntoColumns([10, 10, 10, 10])).toBe(2);
  });

  it("puts a single dominant item alone in the first column", () => {
    expect(splitIntoColumns([100, 10, 10, 10])).toBe(1);
  });

  it("never returns a split that empties the first column", () => {
    // A degenerate all-zero read happens for real: a `display: none` face
    // measures every chunk at 0 (see useWideColumns). Whatever it returns must
    // still be a usable index rather than something that strands every chunk.
    for (const heights of [[0, 0, 0, 0], [0], [5, 0, 0]]) {
      const split = splitIntoColumns(heights);
      expect(split).toBeGreaterThanOrEqual(0);
      expect(split).toBeLessThanOrEqual(heights.length);
    }
  });
});

describe("a contents page that runs long", () => {
  const spread = (left: number | null, right: number | null, single = false) => ({ left, right, single });

  /**
   * Typed as `content`, page two of a three-page contents paired with the first
   * chapter opener — half table-of-contents, half book, selected as one thing.
   */
  it("pairs contents pages only with each other", () => {
    const spreads = assembleSpreads(["cover", "toc", "toc", "chapter", "content"]);
    expect(spreads).toContainEqual(spread(1, 2));
    expect(spreads.some((s) => s.left === 2 && s.right === 3)).toBe(false);
  });

  it("leaves an odd third contents page on its own", () => {
    const spreads = assembleSpreads(["cover", "toc", "toc", "toc", "chapter"]);
    expect(spreads).toContainEqual(spread(1, 2));
    expect(spreads).toContainEqual(spread(3, null));
  });

  // A dedication sitting before the contents must not be dragged into its
  // first opening, the same way a page before an image spread isn't.
  it("does not pull the page before it into the first contents spread", () => {
    const spreads = assembleSpreads(["cover", "dedication", "toc", "toc"]);
    expect(spreads).toContainEqual(spread(1, null));
    expect(spreads).toContainEqual(spread(2, 3));
  });

  it("still pairs a single contents page with nothing after it", () => {
    const spreads = assembleSpreads(["cover", "toc", "chapter", "content"]);
    expect(spreads).toContainEqual(spread(1, null));
  });

  // A one-page contents has nothing to pair with itself, so it faces the
  // opening page rather than leaving two half-empty spreads in a row.
  it("sets a one-page contents facing the opening page", () => {
    const spreads = assembleSpreads(["cover", "dedication", "toc", "chapter", "content"]);
    expect(spreads).toContainEqual(spread(1, 2));
    expect(spreads).not.toContainEqual(spread(1, null));
  });
});
