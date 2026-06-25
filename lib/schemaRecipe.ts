import type { Recipe, RecipeInstruction, RecipeNutrition } from "@/types/recipe";

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

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function typeMatches(node: AnyRecord, expected: string): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type.toLowerCase() === expected.toLowerCase();
  if (Array.isArray(type)) {
    return type.some((it) => typeof it === "string" && it.toLowerCase() === expected.toLowerCase());
  }
  return false;
}

function findRecipeNode(value: unknown): AnyRecord | null {
  const node = asRecord(value);
  if (!node) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findRecipeNode(item);
        if (found) return found;
      }
    }
    return null;
  }

  if (typeMatches(node, "Recipe")) return node;

  const graph = node["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  }

  for (const key of ["mainEntity", "mainEntityOfPage", "about"]) {
    const found = findRecipeNode(node[key]);
    if (found) return found;
  }

  return null;
}

function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string") return asString(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = imageFrom(item);
      if (image) return image;
    }
    return undefined;
  }
  const node = asRecord(value);
  return node ? asString(node.url) ?? asString(node.contentUrl) : undefined;
}

function nameFrom(value: unknown): string | undefined {
  if (typeof value === "string") return asString(value);
  const node = asRecord(value);
  return node ? asString(node.name) : undefined;
}

function durationFrom(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;

  const match = raw.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) return raw;

  const [, days, hours, minutes] = match;
  const parts = [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : raw;
}

function instructionText(value: unknown): string[] {
  const text = asString(value);
  if (text) return [text];

  if (Array.isArray(value)) return value.flatMap(instructionText);

  const node = asRecord(value);
  if (!node) return [];

  if (typeMatches(node, "HowToSection")) {
    return instructionText(node.itemListElement);
  }

  const direct = asString(node.text) ?? asString(node.name);
  if (direct) return [direct];

  return instructionText(node.itemListElement);
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
  const instructions: RecipeInstruction[] = instructionText(recipeNode.recipeInstructions).map(
    (text, index) => ({
      step: index + 1,
      text,
    }),
  );

  if (ingredients.length === 0 && instructions.length === 0) return null;

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
  const scriptPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

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
          /* Ignore malformed structured-data blocks. */
        }
      }
    }
    match = scriptPattern.exec(html);
  }

  return blocks;
}
