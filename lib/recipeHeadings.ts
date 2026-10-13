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
 * The words a card prints for itself, in the language the recipe is written
 * in: the two default headings, and the notes after "Steps" when the method
 * runs on. A German recipe prints "Zutaten", "Zubereitung (Rückseite)". Each
 * is the wording that language's own cookbooks use, which is rarely a
 * word-for-word "Steps".
 *
 * Keyed by language subtag, with a region or script only where it changes the
 * words (Brazilian vs European Portuguese, Serbian Latin vs Cyrillic). A
 * language that isn't here keeps the English row: a wrong translation on a
 * printed card is worse than ours. `recipe.language` is set only when
 * CookPilot was sure (lib/cookpilot.ts).
 */
export interface RecipeCardWords {
  ingredientsHeading: string;
  stepsHeading: string;
  /** After the steps heading on a card's front: the method runs on overleaf. */
  onBack: string;
  /** The same on a cookbook page, which runs on to the next leaf instead. */
  nextPage: string;
  /** After the steps heading where the method picks up again. */
  continued: string;
}

type WordsRow = readonly [ingredients: string, steps: string, onBack: string, nextPage: string, continued: string];

const ENGLISH: WordsRow = [
  DEFAULT_RECIPE_HEADINGS.ingredientsHeading,
  DEFAULT_RECIPE_HEADINGS.stepsHeading,
  "on back",
  "next page",
  "continued",
];

const CARD_WORDS: Record<string, WordsRow> = {
  ar: ["المكونات", "طريقة التحضير", "على الوجه الآخر", "الصفحة التالية", "تابع"],
  bg: ["Продукти", "Начин на приготвяне", "на гърба", "следваща страница", "продължение"],
  bs: ["Sastojci", "Priprema", "na poleđini", "sljedeća stranica", "nastavak"],
  ca: ["Ingredients", "Preparació", "al dors", "pàgina següent", "continuació"],
  cs: ["Suroviny", "Postup", "na zadní straně", "další strana", "pokračování"],
  da: ["Ingredienser", "Fremgangsmåde", "på bagsiden", "næste side", "fortsat"],
  de: ["Zutaten", "Zubereitung", "Rückseite", "nächste Seite", "Fortsetzung"],
  el: ["Υλικά", "Εκτέλεση", "στο πίσω μέρος", "επόμενη σελίδα", "συνέχεια"],
  en: ENGLISH,
  es: ["Ingredientes", "Preparación", "al dorso", "página siguiente", "continuación"],
  et: ["Koostisosad", "Valmistamine", "tagaküljel", "järgmine lehekülg", "järg"],
  fa: ["مواد لازم", "طرز تهیه", "پشت صفحه", "صفحهٔ بعد", "ادامه"],
  fi: ["Ainekset", "Valmistus", "kääntöpuolella", "seuraava sivu", "jatkoa"],
  fr: ["Ingrédients", "Préparation", "au verso", "page suivante", "suite"],
  he: ["מצרכים", "אופן ההכנה", "בגב הכרטיס", "בעמוד הבא", "המשך"],
  hi: ["सामग्री", "विधि", "पीछे देखें", "अगला पृष्ठ", "जारी"],
  hr: ["Sastojci", "Priprema", "na poleđini", "sljedeća stranica", "nastavak"],
  hu: ["Hozzávalók", "Elkészítés", "a hátoldalon", "következő oldal", "folytatás"],
  id: ["Bahan", "Cara membuat", "di balik kartu", "halaman berikutnya", "lanjutan"],
  it: ["Ingredienti", "Preparazione", "sul retro", "pagina seguente", "seguito"],
  ja: ["材料", "作り方", "裏面へ", "次ページへ", "続き"],
  ko: ["재료", "만드는 법", "뒷면에 계속", "다음 페이지", "계속"],
  lt: ["Ingredientai", "Gaminimo eiga", "kitoje pusėje", "kitas puslapis", "tęsinys"],
  lv: ["Sastāvdaļas", "Pagatavošana", "otrā pusē", "nākamā lappuse", "turpinājums"],
  ms: ["Bahan-bahan", "Cara memasak", "di belakang kad", "halaman seterusnya", "sambungan"],
  nb: ["Ingredienser", "Fremgangsmåte", "på baksiden", "neste side", "fortsettelse"],
  nl: ["Ingrediënten", "Bereiding", "achterzijde", "volgende pagina", "vervolg"],
  nn: ["Ingrediensar", "Framgangsmåte", "på baksida", "neste side", "framhald"],
  no: ["Ingredienser", "Fremgangsmåte", "på baksiden", "neste side", "fortsettelse"],
  pl: ["Składniki", "Przygotowanie", "na odwrocie", "następna strona", "ciąg dalszy"],
  pt: ["Ingredientes", "Modo de preparo", "no verso", "próxima página", "continuação"],
  "pt-pt": ["Ingredientes", "Preparação", "no verso", "página seguinte", "continuação"],
  ro: ["Ingrediente", "Mod de preparare", "pe verso", "pagina următoare", "continuare"],
  ru: ["Ингредиенты", "Приготовление", "на обороте", "следующая страница", "продолжение"],
  sk: ["Suroviny", "Postup", "na zadnej strane", "ďalšia strana", "pokračovanie"],
  sl: ["Sestavine", "Priprava", "na hrbtni strani", "naslednja stran", "nadaljevanje"],
  sr: ["Састојци", "Припрема", "на полеђини", "следећа страна", "наставак"],
  "sr-latn": ["Sastojci", "Priprema", "na poleđini", "sledeća strana", "nastavak"],
  sv: ["Ingredienser", "Gör så här", "på baksidan", "nästa sida", "fortsättning"],
  th: ["ส่วนผสม", "วิธีทำ", "ดูด้านหลัง", "หน้าถัดไป", "ต่อ"],
  tr: ["Malzemeler", "Hazırlanışı", "arka yüzde", "sonraki sayfa", "devamı"],
  uk: ["Інгредієнти", "Приготування", "на звороті", "наступна сторінка", "продовження"],
  vi: ["Nguyên liệu", "Cách làm", "mặt sau", "trang sau", "tiếp theo"],
  zh: ["食材", "做法", "见背面", "见下页", "续"],
};

function cardWordsRow(language: string | undefined): WordsRow | undefined {
  if (!language) return ENGLISH;
  const parts = language.toLowerCase().split("-");
  // "pt-PT" and "sr-Latn-RS" first, then the bare language.
  return CARD_WORDS[`${parts[0]}-${parts[1]}`] ?? CARD_WORDS[`${parts[0]}-${parts[2]}`] ?? CARD_WORDS[parts[0]];
}

// Chinese and Japanese set a note in full-width brackets with no space before
// them: 作り方（続き）, not 作り方 (続き).
const FULL_WIDTH_BRACKETS = new Set(["ja", "zh"]);

/**
 * The card's own words for a recipe in `language`, and the `lang` they are
 * in: undefined when they match the recipe's, "en" when its language isn't
 * in the table and the card falls back to ours. `note` brackets one of them
 * the way that language does, ready to follow a heading.
 */
export function recipeCardWords(
  language: string | undefined,
): RecipeCardWords & { lang?: "en"; note: (text: string) => string } {
  const row = cardWordsRow(language);
  const [ingredientsHeading, stepsHeading, onBack, nextPage, continued] = row ?? ENGLISH;
  const fullWidth = row !== undefined && FULL_WIDTH_BRACKETS.has(language?.toLowerCase().split("-")[0] ?? "");
  return {
    ingredientsHeading,
    stepsHeading,
    onBack,
    nextPage,
    continued,
    note: fullWidth ? (text) => `（${text}）` : (text) => ` (${text})`,
    ...(row ? {} : { lang: "en" }),
  };
}

// Languages written right to left. A script subtag outranks the language
// ("ku-Arab" is, "az-Latn" isn't), since several are written in both.
const RTL_LANGUAGES = new Set(["ar", "arc", "ckb", "dv", "fa", "he", "iw", "ks", "ps", "sd", "ug", "ur", "yi"]);
const RTL_SCRIPTS = new Set(["arab", "hebr", "syrc", "thaa", "nkoo", "adlm"]);
const LTR_SCRIPTS = new Set(["latn", "cyrl"]);

/**
 * "rtl" for a recipe written right to left (Hebrew, Arabic, Persian, Urdu),
 * which the card mirrors; undefined for everything else, which keeps the
 * page's own left-to-right. Independent of the words table: an Urdu recipe is
 * still mirrored when its headings fall back to English.
 */
export function recipeTextDirection(language: string | undefined): "rtl" | undefined {
  if (!language) return undefined;
  const [lang, ...rest] = language.toLowerCase().split("-");
  const script = rest.find((part) => part.length === 4);
  if (script && RTL_SCRIPTS.has(script)) return "rtl";
  if (script && LTR_SCRIPTS.has(script)) return undefined;
  return RTL_LANGUAGES.has(lang) ? "rtl" : undefined;
}

/** The heading a recipe in `language` prints when the cook hasn't renamed it. */
export function defaultRecipeHeading(kind: RecipeHeadingKind, language?: string): string {
  return recipeCardWords(language)[kind];
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
