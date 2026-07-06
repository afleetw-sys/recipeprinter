export interface RecipeIngredient {
  amount?: string;
  unit?: string;
  name: string;
  note?: string;
  raw?: string;
  section?: string;
}

export interface RecipeInstruction {
  step: number;
  text: string;
  section?: string;
}

export interface RecipeNutrition {
  calories?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
  [key: string]: string | undefined;
}

export interface Recipe {
  title: string;
  description?: string;
  image?: string;
  sourceUrl?: string;
  sourceName?: string;

  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string | number;
  yield?: string;

  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];

  tags?: string[];
  cuisine?: string;
  course?: string;
  nutrition?: RecipeNutrition;

  author?: string;
  datePublished?: string;
}

export interface ParseResult {
  success: true;
  recipe: Recipe;
}

export interface ParseError {
  success: false;
  error: string;
}

export type ParseResponse = ParseResult | ParseError;

/* ── Print queue ──────────────────────────────────────────────────────────
   RecipePrinter's primary object is a Print Queue, not a saved library.
   Each method mirrors one of CookPilot's supported import sources.            */

export type ImportMethod = "url" | "image" | "text" | "cookpilot";

export type ParseRequest =
  | { method: "url"; url: string }
  | { method: "image"; images: string[]; label?: string }
  | { method: "text"; text: string };

export type QueueItemStatus = "parsing" | "ready" | "error";

export interface QueueItem {
  id: string;
  method: ImportMethod;
  /** Human-readable origin: hostname for URLs, filename for images, etc. */
  source: string;
  /** Full original URL for `url` items, kept so a failed parse can be retried. */
  originalUrl?: string;
  status: QueueItemStatus;
  /** Best-known title, falls back to the source until parsing resolves. */
  title: string;
  recipe?: Recipe;
  error?: string;
  addedAt: number;
}

export const IMPORT_METHOD_LABEL: Record<ImportMethod, string> = {
  url: "URL",
  image: "Image",
  text: "Pasted text",
  cookpilot: "CookPilot",
};
