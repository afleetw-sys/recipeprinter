import type { Recipe } from "@/types/recipe";

/**
 * The two section headings on a recipe card, "Ingredients" and "Steps".
 *
 * A cook can rename either on one recipe, or remove it. People print more than
 * recipes (lesson notes, packing lists), and "Ingredients" over a list of
 * history topics reads as a mistake; some recipes want "Method" or "For the
 * dough", and a short card can do without a heading at all.
 *
 * Stored on the recipe as three states, the way a chapter's description is:
 * - absent: the default heading, so every recipe saved before this existed
 *   reads exactly as it did;
 * - `""`: removed, and listed by the toolbar's reveal button so it can be
 *   brought back;
 * - anything else: the cook's own heading.
 */
export type RecipeHeadingKind = "ingredientsHeading" | "stepsHeading";

export const DEFAULT_RECIPE_HEADINGS: Record<RecipeHeadingKind, string> = {
  ingredientsHeading: "Ingredients",
  stepsHeading: "Steps",
};

/**
 * The default headings in the language a recipe is written in, so a German
 * recipe prints "Zutaten" and "Zubereitung". Each pair is the wording that
 * language's own cookbooks use, which is rarely a word-for-word "Steps".
 *
 * Keyed by language subtag, with a region only where the region changes the
 * word (Brazilian vs European Portuguese). A language that isn't here keeps
 * the English pair: a wrong translation on a printed card is worse than ours.
 * `recipe.language` is set only when CookPilot was sure (lib/cookpilot.ts).
 */
const LOCALIZED_HEADINGS: Record<string, readonly [ingredients: string, steps: string]> = {
  ar: ["المكونات", "طريقة التحضير"],
  bg: ["Продукти", "Начин на приготвяне"],
  bs: ["Sastojci", "Priprema"],
  ca: ["Ingredients", "Preparació"],
  cs: ["Suroviny", "Postup"],
  da: ["Ingredienser", "Fremgangsmåde"],
  de: ["Zutaten", "Zubereitung"],
  el: ["Υλικά", "Εκτέλεση"],
  en: [DEFAULT_RECIPE_HEADINGS.ingredientsHeading, DEFAULT_RECIPE_HEADINGS.stepsHeading],
  es: ["Ingredientes", "Preparación"],
  et: ["Koostisosad", "Valmistamine"],
  fa: ["مواد لازم", "طرز تهیه"],
  fi: ["Ainekset", "Valmistus"],
  fr: ["Ingrédients", "Préparation"],
  he: ["מצרכים", "אופן ההכנה"],
  hi: ["सामग्री", "विधि"],
  hr: ["Sastojci", "Priprema"],
  hu: ["Hozzávalók", "Elkészítés"],
  id: ["Bahan", "Cara membuat"],
  it: ["Ingredienti", "Preparazione"],
  ja: ["材料", "作り方"],
  ko: ["재료", "만드는 법"],
  lt: ["Ingredientai", "Gaminimo eiga"],
  lv: ["Sastāvdaļas", "Pagatavošana"],
  ms: ["Bahan-bahan", "Cara memasak"],
  nb: ["Ingredienser", "Fremgangsmåte"],
  nl: ["Ingrediënten", "Bereiding"],
  nn: ["Ingrediensar", "Framgangsmåte"],
  no: ["Ingredienser", "Fremgangsmåte"],
  pl: ["Składniki", "Przygotowanie"],
  pt: ["Ingredientes", "Modo de preparo"],
  "pt-pt": ["Ingredientes", "Preparação"],
  ro: ["Ingrediente", "Mod de preparare"],
  ru: ["Ингредиенты", "Приготовление"],
  sk: ["Suroviny", "Postup"],
  sl: ["Sestavine", "Priprava"],
  sr: ["Састојци", "Припрема"],
  "sr-latn": ["Sastojci", "Priprema"],
  sv: ["Ingredienser", "Gör så här"],
  th: ["ส่วนผสม", "วิธีทำ"],
  tr: ["Malzemeler", "Hazırlanışı"],
  uk: ["Інгредієнти", "Приготування"],
  vi: ["Nguyên liệu", "Cách làm"],
  zh: ["食材", "做法"],
};

function localizedHeadings(language: string | undefined) {
  if (!language) return undefined;
  const parts = language.toLowerCase().split("-");
  // "pt-PT" and "sr-Latn-RS" first, then the bare language.
  return (
    LOCALIZED_HEADINGS[`${parts[0]}-${parts[1]}`] ??
    LOCALIZED_HEADINGS[`${parts[0]}-${parts[2]}`] ??
    LOCALIZED_HEADINGS[parts[0]]
  );
}

/** The heading a recipe in `language` prints when the cook hasn't renamed it. */
export function defaultRecipeHeading(kind: RecipeHeadingKind, language?: string): string {
  const localized = localizedHeadings(language);
  if (!localized) return DEFAULT_RECIPE_HEADINGS[kind];
  return localized[kind === "ingredientsHeading" ? 0 : 1];
}

/**
 * Whether a recipe's default headings are in its own language. When they
 * aren't (a language missing above), they are English on a card that isn't,
 * and the card marks them `lang="en"`.
 */
export function defaultHeadingsMatchRecipe(language: string | undefined): boolean {
  return !language || localizedHeadings(language) !== undefined;
}

/** What the card prints for this heading. `""` means it is removed. */
export function recipeHeading(recipe: Recipe, kind: RecipeHeadingKind): string {
  return recipe[kind] ?? defaultRecipeHeading(kind, recipe.language);
}

/**
 * What to store for a heading the cook has just typed.
 *
 * The default typed back in (in any case, since the card prints headings in
 * capitals and the cook may type what they see) is stored as absent rather
 * than as a copy, so the recipe follows the default again.
 */
export function storedRecipeHeading(
  kind: RecipeHeadingKind,
  typed: string,
  language?: string,
): string | undefined {
  const trimmed = typed.trim();
  // The default in the recipe's language. On a German recipe "Ingredients"
  // is a choice, not the default, so it is stored.
  if (trimmed.toLocaleLowerCase() === defaultRecipeHeading(kind, language).toLocaleLowerCase()) {
    return undefined;
  }
  return trimmed;
}

/** The value a removed heading's field opens with when it is brought back. */
export function revealedHeadingValue(recipe: Recipe, kind: RecipeHeadingKind): string {
  return recipe[kind] === "" ? defaultRecipeHeading(kind, recipe.language) : recipeHeading(recipe, kind);
}

/**
 * The headings this recipe has removed, for the reveal button: "heading" for
 * one, "headings" for both. Only a heading over a section the card actually
 * has counts; there is nothing to bring back over a list that is not there.
 */
export function removedHeadingsName(recipe: Recipe): string | null {
  const removed = [
    recipe.ingredients.length > 0 && recipe.ingredientsHeading === "",
    recipe.instructions.length > 0 && recipe.stepsHeading === "",
  ].filter(Boolean).length;
  if (removed === 0) return null;
  return removed === 1 ? "heading" : "headings";
}
