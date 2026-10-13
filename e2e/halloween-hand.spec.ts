import { expect, test } from "./guarded";
import { longRecipe, openPrint } from "./printOverflow";

/**
 * Halloween's hand is drawn holding up the recipe photo, so it has to sit
 * right under it. It was attached to the start of the steps, which is under
 * the photo only when the steps are the right-hand column. On a card whose
 * ingredients run full width above the steps, it dropped well below the
 * photo, and with no steps on the face at all it vanished.
 */

const photo = "/images/show-photo.png";

const recipes = {
  short: {
    title: "Mini Cookie Cheesecakes",
    image: photo,
    ingredients: [
      "1 pkg pumpkin shape cookie dough (9-oz.) (20 pre-cut cookies)",
      "1 pkg cream cheese (8-oz.), softened",
      "1/2 c granulated sugar (100 g)",
      "1 large egg, room temperature",
      "1/3 c sour cream, room temperature",
      "1/2 tsp pure vanilla extract",
      "1 1/4 c cold heavy cream",
      "1/4 c confectioners' sugar (30 g)",
    ].map((raw) => ({ raw })),
    instructions: [
      "Preheat the oven to 350 and line a muffin tin with ten liners, then press a round of dough into each.",
      "Bake until just golden and set, 12 to 14 minutes, and let them cool in the tin.",
      "Beat the cream cheese and sugar until smooth, add the egg, sour cream and vanilla, and divide among the cups.",
      "Bake until the edges are just set, then cool and refrigerate for at least 2 hours.",
      "Whip the cream and confectioners' sugar to stiff peaks and pipe it over the cheesecakes.",
    ].map((text, i) => ({ step: i + 1, text })),
  },
  long: { ...longRecipe, image: photo },
  "ingredients only": {
    title: "Spice Mix",
    image: photo,
    ingredients: ["2 tbsp cinnamon", "1 tbsp ginger", "1 tsp nutmeg", "1/2 tsp cloves"].map((raw) => ({ raw })),
    instructions: [],
  },
};

for (const size of ["card-6x4", "letter"]) {
  for (const [name, recipe] of Object.entries(recipes)) {
    test(`Halloween's hand sits under the photo: ${name}, ${size}`, async ({ page }) => {
      await openPrint(page, size, recipe, "halloween");
      const card = page.locator("#recipe-page-deck .recipe-card").first();
      await expect(card.locator(".recipe-card__photo-img")).toBeVisible();

      const placement = await card.evaluate((el) => {
        const photoBottom = el.querySelector(".recipe-card__photo")!.getBoundingClientRect().bottom;
        // The hand is a `::before` floated first in its section, so its top is
        // that section's top.
        const holders = Array.from(el.querySelectorAll<HTMLElement>(".recipe-card__cols > section")).filter(
          (section) => {
            const hand = getComputedStyle(section, "::before");
            return hand.content !== "none" && hand.backgroundImage.includes("halloween-hand");
          },
        );
        if (holders.length !== 1) return { hands: holders.length };
        const hand = getComputedStyle(holders[0], "::before");
        // The preview is scaled; the hand's computed height is not.
        const scale = el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth;
        return {
          hands: 1,
          gap: (holders[0].getBoundingClientRect().top - photoBottom) / scale,
          handHeight: parseFloat(hand.height),
        };
      });

      expect(placement.hands).toBe(1);
      // Its top within half its own height of the photo's bottom.
      expect(placement.gap!).toBeLessThan(placement.handHeight! / 2);
    });
  }
}
