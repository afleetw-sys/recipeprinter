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
  /** One or more recipes. A normal page yields exactly one; a "roundup" URL
      (RecipePrinter multi-recipe import) yields several. */
  recipes: Recipe[];
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

/** How a section opener shows its photo(s), mirroring the recipe photo model
    (`PhotoStyle`) plus a chapter-only grid:
    - `none` — a typographic opener, no photo, no facing page;
    - `band` — a photo in the opener's own top band (the legacy `photoUrl`);
    - `full` — a full-bleed photo on the page FACING the opener (like a recipe
      image-spread);
    - `grid` — a curated photo collage on the facing page (`gridImages`).
    Absent resolves via `resolveSectionPhotoMode`: a `photoUrl` present → `band`,
    else `none`. Only meaningful in cookbook mode. */
export type SectionPhotoMode = "none" | "band" | "full" | "grid";

export interface Section {
  id: string;
  /** Untitled = no visible grouping in the UI, no divider page when printed. */
  title?: string;
  /** Optional secondary line on a cookbook section opener. */
  subtitle?: string;
  /** Chapter-opener photo (cookbook mode only). Carries both the `band` (in-card)
      photo and the `full` facing photo — the single source, like a recipe's
      `heroImageUrl`. */
  photoUrl?: string;
  /** Explicit opener photo placement. Absent = derived (see `SectionPhotoMode`). */
  photoMode?: SectionPhotoMode;
  /** Curated photos for the `grid` facing page (a chapter collage). */
  gridImages?: string[];
  /** Short chapter intro line shown on the opener (cookbook mode only). */
  intro?: string;
  /** Whether this named section receives a printed opener page. */
  showOpener?: boolean;
  /** Legacy books may retain explicit Chapter One/Two labels. */
  numberAsChapter?: boolean;
  items: QueueItem[];
}

/** Which print-format preset a cookbook exports at. Each id maps to a full
    page geometry (trim size, bleed, margin, binding gutter) in
    `lib/cookbookPresets.ts`. Only meaningful in cookbook mode. */
export type CookbookPresetId = "us-letter" | "hardcover-8x10";

/** How a single recipe's (unchanged) card is placed on the cookbook page.
    `full` — one card per sheet (a cookbook always gives each recipe its own full
    page, even when the recipe doesn't fill it). `image-spread` — the card on a
    recto page with a full-bleed photo on the facing verso. Only meaningful in
    cookbook mode; plain card printing ignores it entirely. */
export type RecipePageLayout = "full" | "image-spread";

/** Per-recipe cookbook placement, keyed by `QueueItem.id`. Kept out of
    `QueueItem` so the import/parse/queue lifecycle stays untouched by a
    book-only concern (mirrors how section membership lives in ProjectMeta). */
export interface RecipePagePlacement {
  pageLayout?: RecipePageLayout;
  /** Facing-page image for the `image-spread` layout. */
  heroImageUrl?: string;
  /** Focal point (CSS object-position, 0–100%) for the full-bleed image-spread
      photo, so a cook can reposition the crop instead of always center-cutting.
      Absent = 50/50 (centered). */
  heroFocusX?: number;
  heroFocusY?: number;
  /** Per-page override of the book-wide "Include recipe photo" default
      (cookbook mode). `undefined` = follow the global toggle; `true`/`false` =
      force this recipe's header photo on/off regardless. Ignored for
      `image-spread`, whose photo IS the facing page. */
  showPhoto?: boolean;
}

export interface CoverConfig {
  title: string;
  subtitle?: string;
  author?: string;
  /** Optional edition or year line, e.g. "2026 Family Edition". */
  edition?: string;
  /** How the author line is introduced. */
  creditLabel?: "by" | "compiled-by";
  /** Curated cookbook cover composition. */
  layout?: "photo" | "collage" | "typographic";
  imageUrl?: string;
  /** A photo collage cover — the first few recipe photos in a grid. Takes
      precedence over `imageUrl`; empty/undefined falls back to a single
      `imageUrl`, and neither means a photo-free typographic cover. */
  gridImages?: string[];
  template: RecipePrintTemplate;
  /** Back-cover-only closing line ("from the kitchen of…"). */
  blurb?: string;
  /** Front-cover treatment. `photo` (default) fills the page with the image and
      sets the title over a scrim; `band` puts the title on a solid lower band. */
  style?: "photo" | "band";
}

export interface CookbookFrontMatter {
  kind: "dedication" | "introduction";
  heading?: string;
  body?: string;
  /** Optional closing line, e.g. "— The Smith Family". */
  signature?: string;
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
  /** The print-format preset a cookbook was last exported at (see
      `CookbookPresetId`). Undefined for plain-card projects and older cookbooks
      saved before presets existed — those fall back to the default preset. */
  bookPreset?: CookbookPresetId;
  /** The premium-workspace introduction has been completed for this project. */
  cookbookWelcomeCompleted?: boolean;
  tocKicker?: string;
  tocTitle?: string;
  photoStyle?: "none" | "card" | "full";
}

export interface PrintProject {
  id: string;
  /** Distinguishes automatic cookbook persistence from opt-in card projects. */
  kind?: "cookbook" | "printProject";
  /** Optimistic-concurrency version. Legacy documents default to 0. */
  revision?: number;
  /** Present only once the project has been saved to Firestore. */
  ownerUid?: string;
  /** Absent until a cover is added or a second named section is created. */
  title?: string;
  /** Always at least one section; a brand-new project is one untitled section. */
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  /** Optional dedication / front-matter page (cookbook mode). See ProjectMeta. */
  dedication?: CoverConfig;
  /** Typed replacement for the legacy dedication-as-cover representation. */
  frontMatter?: CookbookFrontMatter;
  settings: PrintProjectSettings;
  /** Per-recipe cookbook page layouts, keyed by `QueueItem.id` (see
      `RecipePagePlacement`). Absent for plain card projects. Kept alongside
      sections so a saved cookbook restores its per-recipe layout choices. */
  itemPlacements?: Record<string, RecipePagePlacement>;
  createdAt: number;
  updatedAt: number;
}
