import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";

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

export type ImportMethod = "url" | "image" | "text" | "cookpilot" | "shared";

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

/* ── Print project ────────────────────────────────────────────────────────
   The section-based document model that scales from a single recipe print
   to a full cookbook without ever becoming a different object. A `Section`
   holds `QueueItem`s (not a simplified recipe wrapper) so the existing
   parsing/retry lifecycle in lib/queue.ts keeps working unchanged inside it.
   See the "Document model: sections, not divider objects" section of the
   implementation plan for the reasoning. */

export interface Section {
  id: string;
  /** Untitled = no visible grouping in the UI, no divider page when printed. */
  title?: string;
  items: QueueItem[];
}

export type BookTrimSize = "letter-portrait" | "8x10-portrait" | "8.5x11-portrait";

export interface CoverConfig {
  title: string;
  subtitle?: string;
  author?: string;
  imageUrl?: string;
  template: RecipePrintTemplate;
}

export interface PrintProjectSettings {
  cardSize: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  showPhoto: boolean;
  showSourceUrl: boolean;
  showCutLines: boolean;
  /** Book-only settings — stay undefined/off until "Make it a cookbook" has
      been used to opt into the cookbook experience. */
  cookbookMode?: boolean;
  tableOfContents?: boolean;
  sectionDividers?: boolean;
  bookTrimSize?: BookTrimSize;
}

export interface PrintProject {
  id: string;
  /** Present only once the project has been saved to Firestore. */
  ownerUid?: string;
  /** Absent until a cover is added or a second named section is created. */
  title?: string;
  /** Always at least one section; a brand-new project is one untitled section. */
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  settings: PrintProjectSettings;
  createdAt: number;
  updatedAt: number;
}
