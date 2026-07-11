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

function findRecipeNode(value: unknown, seen = new WeakSet<object>()): AnyRecord | null {
  const node = asRecord(value);
  if (!node) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findRecipeNode(item, seen);
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
      const found = findRecipeNode(item, seen);
      if (found) return found;
    }
  }

  for (const key of ["mainEntity", "mainEntityOfPage", "about"]) {
    const found = findRecipeNode(node[key], seen);
    if (found) return found;
  }

  for (const child of Object.values(node)) {
    if (!child || typeof child !== "object") continue;
    const found = findRecipeNode(child, seen);
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

export function jsonDataBlocksFromHtml(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptPattern =
    /<script\b(?=[^>]*type=["']?application\/json["']?)[^>]*>([\s\S]*?)<\/script>/gi;

  let match = scriptPattern.exec(html);
  while (match) {
    const raw = match[1]?.trim();
    if (raw) {
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
