"use client";

import { TemplateThumbnail } from "@/components/print/TemplateThumbnail";
import type { Recipe, RecipePrintTemplate } from "@/types/recipe";

/**
 * Three Pro theme cards in a row: what Pro gets you, shown with the themes
 * themselves. Each is the theme picker's own preview (the real card, scaled
 * down), so it can't drift from the real theme the way a drawn imitation does.
 * Needs print.css, so it lives on /print only.
 *
 * Side by side and whole, evenly spaced: every theme's art shows (Garden's
 * tomatoes, Halloween's hand and photo, Bistro's gingham), and it's the
 * shortest layout for the dialog. A different recipe on each.
 */
const CARDS: Array<{ template: RecipePrintTemplate; recipe: Recipe }> = [
  {
    template: "garden",
    recipe: {
      title: "Tomato Soup",
      servings: 4,
      totalTime: "40 min",
      ingredients: [{ name: "2 lb tomatoes" }, { name: "1 onion" }, { name: "2 cups stock" }],
      instructions: [{ step: 1, text: "Roast the tomatoes." }, { step: 2, text: "Simmer and blend." }],
    },
  },
  {
    template: "halloween",
    recipe: {
      title: "Pumpkin Bread",
      // The theme's hand holds up the recipe photo.
      image: "/images/pumpkin-bread.jpg",
      servings: 8,
      totalTime: "1 hr 10 min",
      ingredients: [{ name: "1 cup pumpkin" }, { name: "2 cups flour" }, { name: "1 tsp cinnamon" }],
      instructions: [{ step: 1, text: "Whisk it all together." }, { step: 2, text: "Bake at 350°F." }],
    },
  },
  {
    template: "bistro",
    recipe: {
      title: "Lemon Pasta",
      servings: 4,
      totalTime: "25 min",
      ingredients: [{ name: "12 oz spaghetti" }, { name: "2 lemons" }, { name: "1 cup parmesan" }],
      instructions: [{ step: 1, text: "Boil the spaghetti." }, { step: 2, text: "Toss with lemon." }],
    },
  },
];

export function ProThemeStack({ className = "" }: { className?: string }) {
  return (
    // `text-left`: the dialog centres its own text, and a card must lay out the
    // way its theme does, not inherit that.
    <div className={`mx-auto grid w-full max-w-[372px] grid-cols-3 gap-cp-2 text-left ${className}`} aria-hidden>
      {CARDS.map(({ template, recipe }) => (
        <div key={template} className="overflow-hidden rounded-sm border border-line bg-card">
          <TemplateThumbnail template={template} recipe={recipe} />
        </div>
      ))}
    </div>
  );
}
