import type { Recipe, RecipeIngredient, RecipeInstruction } from "@/types/recipe";

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

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function flattenIngredients(sections: unknown): RecipeIngredient[] {
  if (!Array.isArray(sections)) return [];
  const out: RecipeIngredient[] = [];
  for (const section of sections) {
    const list = (section as AnyRecord)?.ingredients;
    if (!Array.isArray(list)) continue;
    for (const ing of list) {
      const i = ing as AnyRecord;
      const name = asString(i.name);
      if (!name) continue;
      out.push({
        amount: asString(i.amount),
        unit: asString(i.unit),
        name,
        note: asString(i.notes) ?? asString(i.note),
      });
    }
  }
  return out;
}

function flattenInstructions(sections: unknown): RecipeInstruction[] {
  if (!Array.isArray(sections)) return [];
  const out: RecipeInstruction[] = [];
  let step = 1;
  for (const section of sections) {
    const list = (section as AnyRecord)?.instructions;
    if (!Array.isArray(list)) continue;
    for (const ins of list) {
      const text = asString((ins as AnyRecord).text);
      if (!text) continue;
      out.push({ step: step++, text });
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
    return {
      ...flat,
      title: asString(flat.title) ?? "Untitled recipe",
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
    image: asString(data.imageURL) ?? asString(data.image),
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
