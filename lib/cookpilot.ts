import type { Recipe, RecipeIngredient, RecipeInstruction } from "@/types/recipe";
import { bestRecipeImageFrom } from "@/lib/recipeImages";
import { hostnameOf } from "@/lib/url";

/* ──────────────────────────────────────────────────────────────────────────
   CookPilot is the parsing backend. RecipePrinter never re-implements a parser;
   it calls CookPilot's Cloud Function callables and adapts the response.

   CookPilot returns its `RecipeData` shape (section-based ingredients and
   instructions). This module flattens that into RecipePrinter's print-friendly
   `Recipe`, and also tolerates an already-flat response and the image parser's
   `recipeJSON` envelope.
   ────────────────────────────────────────────────────────────────────────── */

type AnyRecord = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function sectionTitle(section: AnyRecord): string | undefined {
  return (
    asString(section.title) ??
    asString(section.name) ??
    asString(section.heading) ??
    asString(section.label)
  );
}

function flattenIngredients(sections: unknown): RecipeIngredient[] {
  if (!Array.isArray(sections)) return [];
  const out: RecipeIngredient[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const sectionNode = section as AnyRecord;
    const title = sectionTitle(sectionNode);
    const list = sectionNode?.ingredients;
    if (!Array.isArray(list)) continue;
    for (const ing of list) {
      const i = ing as AnyRecord;
      const name = asString(i.name);
      if (!name) continue;
      const amount = asString(i.amount);
      const unit = asString(i.unit);
      const note = asString(i.notes) ?? asString(i.note);
      out.push({
        amount,
        unit,
        name,
        note,
        raw: ingredientRawLine(amount, unit, name, note),
        section: title,
      });
    }
  }
  return out;
}

function ingredientRawLine(
  amount: string | undefined,
  unit: string | undefined,
  name: string,
  note: string | undefined,
): string {
  const quantity = [amount, unit].filter(Boolean).join(" ");
  return [quantity, name].filter(Boolean).join(" ") + (note ? `, ${note}` : "");
}

function flattenInstructions(sections: unknown): RecipeInstruction[] {
  if (!Array.isArray(sections)) return [];
  const out: RecipeInstruction[] = [];
  let step = 1;
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const sectionNode = section as AnyRecord;
    const title = sectionTitle(sectionNode);
    const list = sectionNode?.instructions;
    if (!Array.isArray(list)) continue;
    for (const ins of list) {
      const text = asString((ins as AnyRecord).text);
      if (!text) continue;
      out.push({ step: step++, text, section: title });
    }
  }
  return out;
}

/**
 * Adapts CookPilot's parser output into a flat `Recipe`. `body` is the parsed
 * JSON from CookPilot; `sourceUrl` is the original import URL when known.
 */
export function adaptCookPilotRecipe(body: unknown, sourceUrl?: string): Recipe | null {
  if (!body || typeof body !== "object") return null;
  const root = body as AnyRecord;

  // The image parser can return the recipe as a JSON string in `recipeJSON`.
  const fromJson = parseRecipeJSON(
    (root.recipeJSON as string | undefined) ??
      ((root.data as AnyRecord)?.recipeJSON as string | undefined),
  );

  // Unwrap the common envelopes: { recipe }, { data: { recipe } }, raw RecipeData.
  const data =
    (root.recipe as AnyRecord) ??
    ((root.data as AnyRecord)?.recipe as AnyRecord) ??
    fromJson ??
    root;
  if (!data || typeof data !== "object") return null;

  // Already flat (RecipePrinter shape)?
  if (Array.isArray(data.ingredients) || Array.isArray(data.instructions)) {
    const flat = data as unknown as Recipe;
    const flatNode = data as AnyRecord;
    return {
      ...flat,
      title: asString(flat.title) ?? "Untitled recipe",
      image: bestRecipeImageFrom(flatNode.imageURL, flatNode.imageUrl, flatNode.image, flatNode.images),
      sourceUrl: flat.sourceUrl ?? sourceUrl,
      sourceName: flat.sourceName ?? (sourceUrl ? hostnameOf(sourceUrl) : undefined),
      ingredients: Array.isArray(flat.ingredients) ? flat.ingredients : [],
      instructions: Array.isArray(flat.instructions) ? flat.instructions : [],
    };
  }

  // CookPilot RecipeData (section-based).
  const ingredients = flattenIngredients(data.ingredientSections);
  const instructions = flattenInstructions(data.instructionSections);
  if (ingredients.length === 0 && instructions.length === 0 && !asString(data.title)) {
    return null;
  }

  const servings = data.servings;
  return {
    title: asString(data.title) ?? "Untitled recipe",
    description: asString(data.description),
    image: bestRecipeImageFrom(data.imageURL, data.imageUrl, data.image, data.images),
    sourceUrl,
    sourceName: sourceUrl ? hostnameOf(sourceUrl) : undefined,
    prepTime: asString(data.prepTime),
    cookTime: asString(data.cookTime),
    totalTime: asString(data.totalTime),
    servings:
      typeof servings === "number" || typeof servings === "string" ? servings : undefined,
    ingredients,
    instructions,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
  };
}

/**
 * Array-aware sibling of `adaptCookPilotRecipe` for the RecipePrinter-only
 * multi-recipe URL path. When CookPilot returns `{ recipes: RecipeData[] }` (a
 * roundup page), each element is flattened through the single-recipe adapter and
 * invalid entries are dropped. Any other shape (`{ recipe }`, raw `RecipeData`,
 * the image parser's envelope) falls back to the single adapter and is wrapped
 * as a one-element array — so a normal single-recipe response still yields one.
 */
export function adaptCookPilotRecipes(body: unknown, sourceUrl?: string): Recipe[] {
  if (body && typeof body === "object" && Array.isArray((body as AnyRecord).recipes)) {
    const recipes = (body as AnyRecord).recipes as unknown[];
    return recipes
      .map((entry) => adaptCookPilotRecipe(entry, sourceUrl))
      .filter((recipe): recipe is Recipe => recipe !== null);
  }
  const one = adaptCookPilotRecipe(body, sourceUrl);
  return one ? [one] : [];
}

function parseRecipeJSON(recipeJSON: string | undefined): AnyRecord | null {
  if (!recipeJSON) return null;
  try {
    const parsed = JSON.parse(recipeJSON);
    return parsed && typeof parsed === "object" ? (parsed as AnyRecord) : null;
  } catch {
    return null;
  }
}

/** Normalizes a user-pasted URL (mirrors CookPilot's normalizeImportURL). */
export function normalizeImportURL(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}
