// Builds a real `.paprikarecipes` file so the Paprika import can be tested by
// someone who doesn't own Paprika.
//
// Not a mock: this writes the actual container the app has to read — a ZIP
// whose entries are gzip-compressed JSON, with a real JPEG embedded as base64
// in `photo_data`, exactly as Paprika's own "Export Recipes → Paprika Recipe
// Format" does. Drop the result on the Paprika row in the Recipe apps tab.
//
//   node scripts/make-paprika-fixture.mjs [outputPath]
//
// Defaults to ./paprika-fixture.paprikarecipes.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync, zipSync } from "fflate";

const PHOTO = readFileSync(resolve("public/images/bruschetta.jpg")).toString("base64");

// Between them these cover the shapes the reader has to handle: section
// headings in both blocks, hand-numbered steps, vulgar fractions, a recipe
// with no photo, a recipe with directions but no ingredient list, and a
// non-recipe entry of the kind a real export carries.
const RECIPES = [
  {
    uid: "1D2F3A4B-0001-4C5D-8E9F-000000000001",
    name: "Bruschetta with Summer Tomatoes",
    servings: "4",
    prep_time: "15 min",
    cook_time: "5 min",
    total_time: "20 min",
    source: "Grandma's card",
    source_url: "https://example.com/bruschetta",
    categories: ["Appetizers", "Summer"],
    description: "The one everybody asks for.",
    ingredients:
      "For the topping:\n4 ripe tomatoes, diced\n2 cloves garlic, minced\n¼ cup basil, torn\n1½ tbsp olive oil\n\nFor the bread:\n1 baguette\nFlaky salt",
    directions:
      "1. Toss the tomatoes, garlic, basil and oil together and let them sit for ten minutes.\n2. Slice the baguette and toast it until the edges catch.\n3. Spoon the topping over the toast and finish with flaky salt.",
    notes: "Better an hour after it's made than straight away.",
    photo_data: PHOTO,
  },
  {
    uid: "1D2F3A4B-0002-4C5D-8E9F-000000000002",
    name: "Weeknight Beet Borscht",
    servings: "6",
    total_time: "1 hr 10 min",
    categories: ["Soups", "8B4C2E5A-1111-2222-3333-444444444444"],
    ingredients: "2 lb beets, peeled and grated\n1 onion, sliced\n8 cups stock\n½ cup dill",
    directions:
      "Simmer the beets and onion in the stock until tender.\nSeason hard, then stir in the dill off the heat.",
  },
  {
    uid: "1D2F3A4B-0003-4C5D-8E9F-000000000003",
    name: "Buttermilk Biscuits",
    servings: "12 biscuits",
    prep_time: "20 min",
    cook_time: "12 min",
    ingredients: "3 cups flour\n1 tbsp baking powder\n¾ cup cold butter\n1 cup buttermilk",
    directions: "",
    photo_data: PHOTO,
  },
  {
    uid: "1D2F3A4B-0004-4C5D-8E9F-000000000004",
    name: "Marinated Feta",
    ingredients: "",
    directions:
      "Cube a block of feta and cover it with olive oil, lemon peel, chilli and oregano. Leave it a day.",
  },
  // What a real archive carries alongside the recipes. The reader skips it.
  { uid: "1D2F3A4B-9999-4C5D-8E9F-999999999999", name: "Weeknights", order_flag: 3 },
];

const files = {};
for (const recipe of RECIPES) {
  const safeName = (recipe.name ?? recipe.uid).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  files[`${safeName}.paprikarecipe`] = gzipSync(
    new TextEncoder().encode(JSON.stringify(recipe)),
  );
}

const outputPath = resolve(process.argv[2] ?? "paprika-fixture.paprikarecipes");
writeFileSync(outputPath, zipSync(files));

const withPhotos = RECIPES.filter((recipe) => recipe.photo_data).length;
console.log(
  `Wrote ${outputPath}\n${RECIPES.length - 1} recipes (${withPhotos} with photos), plus one non-recipe entry.`,
);
