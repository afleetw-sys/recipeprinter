import type { Recipe, RecipeInstruction, RecipeNutrition } from "@/types/recipe";
import { bestRecipeImageFrom } from "@/lib/recipeImages";
import { hostnameOf } from "@/lib/url";
import { parseIsoDuration } from "@/lib/time";

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return decodeEntities(value.trim());
  if (typeof value === "number") return String(value);
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean) as string[];
  const single = asString(value);
  return single ? [single] : [];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function typeMatches(node: AnyRecord, expected: string): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type.toLowerCase() === expected.toLowerCase();
  if (Array.isArray(type)) {
    return type.some((it) => typeof it === "string" && it.toLowerCase() === expected.toLowerCase());
  }
  return false;
}

// How deep to look for a Recipe node before giving up.
//
// The walk below descends into every object value, and it is handed more than
// tidy JSON-LD: `jsonDataBlocksFromHtml` also feeds it every
// `<script type="application/json">` on the page, which on a modern recipe site
// means the whole serialized app state (`__NEXT_DATA__` and friends, frequently
// hundreds of KB). Without a bound, a page with no recipe in its structured data
// costs a full traversal of all of it, per import, on the server.
//
// Schema.org nests a recipe a handful of levels at most, and the three paths
// that legitimately go deeper (`@graph`, `mainEntity`, `mainEntityOfPage`,
// `about`) are followed explicitly below rather than stumbled into. 8 is well
// clear of any real markup while cutting off the runaway case. Mirrors the same
// guard `collectImageCandidates` already applies in lib/recipeImages.ts.
const MAX_RECIPE_NODE_DEPTH = 8;

function findRecipeNode(value: unknown, seen = new WeakSet<object>(), depth = 0): AnyRecord | null {
  if (depth > MAX_RECIPE_NODE_DEPTH) return null;
  const node = asRecord(value);
  if (!node) {
    if (Array.isArray(value)) {
      for (const item of value) {
        // An array is a container, not a nesting level — descending into a
        // 200-element list must not burn 200 levels of the budget.
        const found = findRecipeNode(item, seen, depth);
        if (found) return found;
      }
    }
    return null;
  }

  if (seen.has(node)) return null;
  seen.add(node);

  if (typeMatches(node, "Recipe")) return node;

  const graph = node["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findRecipeNode(item, seen, depth);
      if (found) return found;
    }
  }

  for (const key of ["mainEntity", "mainEntityOfPage", "about"]) {
    // The documented wrappers around a recipe, so they don't spend budget.
    const found = findRecipeNode(node[key], seen, depth);
    if (found) return found;
  }

  for (const child of Object.values(node)) {
    if (!child || typeof child !== "object") continue;
    const found = findRecipeNode(child, seen, depth + 1);
    if (found) return found;
  }

  return null;
}

function imageFrom(value: unknown): string | undefined {
  return bestRecipeImageFrom(value);
}

function nameFrom(value: unknown): string | undefined {
  if (typeof value === "string") return asString(value);
  const node = asRecord(value);
  return node ? asString(node.name) : undefined;
}

function durationFrom(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;

  const parsed = parseIsoDuration(raw);
  if (!parsed) return raw;

  const parts = [
    parsed.days ? `${parsed.days}d` : "",
    parsed.hours ? `${parsed.hours}h` : "",
    parsed.minutes ? `${parsed.minutes}m` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : raw;
}

function instructionItems(value: unknown, section?: string): Array<{ text: string; section?: string }> {
  const text = asString(value);
  if (text) return [{ text, section }];

  if (Array.isArray(value)) return value.flatMap((item) => instructionItems(item, section));

  const node = asRecord(value);
  if (!node) return [];

  if (typeMatches(node, "HowToSection")) {
    return instructionItems(node.itemListElement, asString(node.name) ?? section);
  }

  const direct = asString(node.text) ?? asString(node.name);
  if (direct) return [{ text: direct, section }];

  return instructionItems(node.itemListElement, section);
}

function nutritionFrom(value: unknown): RecipeNutrition | undefined {
  const node = asRecord(value);
  if (!node) return undefined;

  const nutrition: RecipeNutrition = {};
  const fields: Record<string, string> = {
    calories: "calories",
    proteinContent: "protein",
    carbohydrateContent: "carbs",
    fatContent: "fat",
    fiberContent: "fiber",
  };

  for (const [schemaKey, recipeKey] of Object.entries(fields)) {
    const parsed = asString(node[schemaKey]);
    if (parsed) nutrition[recipeKey] = parsed;
  }

  return Object.keys(nutrition).length > 0 ? nutrition : undefined;
}

export function recipeFromJsonLd(value: unknown, sourceUrl: string): Recipe | null {
  const recipeNode = findRecipeNode(value);
  if (!recipeNode) return null;

  const ingredients = asStringArray(recipeNode.recipeIngredient).map((raw) => ({
    name: raw,
    raw,
  }));
  const instructions: RecipeInstruction[] = instructionItems(recipeNode.recipeInstructions).map(
    (item, index) => ({
      step: index + 1,
      text: item.text,
      section: item.section,
    }),
  );

  // A usable recipe needs both; a partial JSON-LD hit (e.g. ingredients but no
  // instructions) should fall through to CookPilot's full parser rather than
  // being returned as-is.
  if (ingredients.length === 0 || instructions.length === 0) return null;

  const yieldValues = asStringArray(recipeNode.recipeYield);
  const tags = asStringArray(recipeNode.keywords)
    .flatMap((tag) => tag.split(","))
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title: asString(recipeNode.name) ?? "Untitled recipe",
    description: asString(recipeNode.description),
    image: imageFrom(recipeNode.image),
    sourceUrl,
    sourceName: hostnameOf(sourceUrl),
    prepTime: durationFrom(recipeNode.prepTime),
    cookTime: durationFrom(recipeNode.cookTime),
    totalTime: durationFrom(recipeNode.totalTime),
    servings: yieldValues[0],
    yield: yieldValues.length > 1 ? yieldValues.join(", ") : yieldValues[0],
    ingredients,
    instructions,
    tags: tags.length > 0 ? tags : undefined,
    cuisine: asStringArray(recipeNode.recipeCuisine).join(", ") || undefined,
    course: asStringArray(recipeNode.recipeCategory).join(", ") || undefined,
    nutrition: nutritionFrom(recipeNode.nutrition),
    author: nameFrom(recipeNode.author),
    datePublished: asString(recipeNode.datePublished),
  };
}

export function jsonLdBlocksFromHtml(html: string): unknown[] {
  const blocks: unknown[] = [];
  // Attribute values are sometimes left unquoted (e.g. Yoast SEO emits
  // `type=application/ld+json`), so the quotes around the type value are optional.
  const scriptPattern =
    /<script\b[^>]*type=(["']?)application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;

  let match = scriptPattern.exec(html);
  while (match) {
    const raw = match[2]?.trim();
    if (raw) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        try {
          blocks.push(JSON.parse(decodeEntities(raw)));
        } catch {
          /* Ignore malformed structured-data blocks. */
        }
      }
    }
    match = scriptPattern.exec(html);
  }

  return blocks;
}

/**
 * Whether a raw `application/json` block could possibly hold a recipe.
 *
 * Unlike a JSON-LD block, which exists to describe the page, these are whatever
 * the site's framework serialized — `__NEXT_DATA__`, Nuxt payloads, Shopify
 * state — routinely hundreds of KB of application state with nothing to do with
 * food. Parsing and walking all of it to conclude "no recipe" is the common
 * case, and it is paid per import on the server.
 *
 * `findRecipeNode` only ever matches a node whose `@type` lowercases to exactly
 * "recipe", so those seven characters must appear literally in the source text
 * of any block that could match. A case-insensitive substring test over a string
 * already in memory costs a fraction of parsing it. Deliberately lenient — it
 * looks for the bare word, not `"@type":"Recipe"`, so HTML-entity-encoded or
 * oddly-whitespaced markup still passes through to the real parser.
 */
function mightContainRecipe(raw: string): boolean {
  return /recipe/i.test(raw);
}

export function jsonDataBlocksFromHtml(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptPattern =
    /<script\b(?=[^>]*type=["']?application\/json["']?)[^>]*>([\s\S]*?)<\/script>/gi;

  let match = scriptPattern.exec(html);
  while (match) {
    const raw = match[1]?.trim();
    if (raw && mightContainRecipe(raw)) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        try {
          blocks.push(JSON.parse(decodeEntities(raw)));
        } catch {
          /* Ignore malformed app-data blocks. */
        }
      }
    }
    match = scriptPattern.exec(html);
  }

  return blocks;
}
