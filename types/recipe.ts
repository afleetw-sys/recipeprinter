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
  /** The note printed under the title in a cookbook ("Notes" in the UI).
      An import fills this with whatever blurb the website carried, which is
      usually SEO filler rather than anything worth printing — see
      `descriptionAuthored` for how the two are told apart. */
  description?: string;
  /** This note was typed here, rather than arriving with the import.
      Only ever set by an inline edit, which is the one way a person can put
      words in that field, so "Clear website notes" can spare them.
      Undefined on every recipe saved before the flag existed — those are
      treated as the website's, and the clear dialog says so instead of
      promising to keep something it cannot identify. */
  descriptionAuthored?: boolean;
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
  /**
   * Set when CookPilot's full parser already ran server-side and definitively
   * found no recipe. The client's fallback calls that same parser through its
   * own callable, so a retry would re-run identical work for an identical
   * answer — twice the wait for the cook and twice the parse cost. Absent means
   * the parser was never consulted (not configured for this deployment) or gave
   * an inconclusive answer, and the fallback is still worth trying.
   */
  parserExhausted?: true;
}

export type ParseResponse = ParseResult | ParseError;

/* ── Print queue ──────────────────────────────────────────────────────────
   RecipePrinter's primary object is a Print Queue, not a saved library.
   Each method mirrors one of CookPilot's supported import sources.            */

export type ImportMethod =
  | "url"
  | "image"
  | "text"
  | "cookpilot"
  | "paprika"
  | "shared"
  /** Typed in by hand on the deck rather than imported from anywhere — the
      blank recipe "or add manually" starts. Its own provenance on purpose:
      these skip the parser entirely, so counting them as an import would put
      recipes that were never parsed into the parser's success rate. */
  | "manual";

/**
 * What the import switch offers, which is not the same list as `ImportMethod`.
 *
 * "apps" is a tab (the integrations panel: CookPilot, Paprika) rather than a
 * way a recipe arrived — a recipe added from it lands in the queue as
 * `cookpilot` or `paprika`, never as "apps". Keeping the two unions apart is
 * what stops a tab id from leaking into analytics or a saved queue item.
 */
export type ImportTab = "url" | "image" | "text" | "apps";

/** Recipe order within a section: arranged by hand, or kept alphabetical. */
export type RailSortMode = "custom" | "title";

import type { ImportFailureCode } from "@/lib/analytics";

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
  /** The failure's bucket, for surfaces too small for `error`'s full sentence
      (the toast). Absent on items that failed before this was recorded. */
  errorCode?: ImportFailureCode;
  /**
   * A photo this browser is holding locally and has not uploaded (the key into
   * `lib/localPhotos.ts`). Paprika exports embed their photos as base64 inside
   * the file, and we deliberately don't upload those on import — a photo only
   * reaches Firebase Storage when the recipe reaches somewhere that persists
   * it (saving a project, exporting a cookbook).
   *
   * While it's local, `recipe.image` is a `blob:` URL, which dies with the
   * document. This id is what survives serialization, so the queue can rebuild
   * that URL after a reload — and what the save-time sweep uploads from.
   */
  localPhotoId?: string;
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

/** A section stripped to what's persisted: the organizational fields plus the
    member ids, never recipe content (which the queue owns). `Section` is this
    joined against the live item list — see `buildSections` in lib/project.ts. */
export type SectionMeta = Omit<Section, "items"> & { itemIds: string[] };

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
  /** How far the full-bleed photo is zoomed IN past its cover fit, as a scale
      about the focal point above. 1 (or absent) = the plain cover crop; the
      page always stays fully covered, so there is nothing below 1. */
  heroZoom?: number;
  /** Per-page override of the book-wide "Include recipe photo" default
      (cookbook mode). `undefined` = follow the global toggle; `true`/`false` =
      force this recipe's header photo on/off regardless. Ignored for
      `image-spread`, whose photo IS the facing page. */
  showPhoto?: boolean;
  /**
   * Photos this recipe has worn, oldest first, minus whichever is current.
   *
   * Choosing a custom photo overwrites `recipe.image`, and the picker's list of
   * candidates for a recipe IS `[recipe.image]` — so the imported photo left
   * the dialog the moment it was replaced, with no way back to it short of
   * re-importing the recipe. Kept here rather than on the recipe because it is
   * a fact about this project's presentation, not about the recipe itself.
   */
  photoHistory?: string[];
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
  /** @deprecated Notes have no on/off any more — an empty note prints nothing,
      so "hidden" and "blank" were the same page reached two ways, and the
      switch was the half that hid the slot you write into. Still declared
      because projects saved while it existed carry it; nothing reads it, and a
      book that was saved with it false shows its notes again on reopening.
      The name stays taken so it is never reused for something else. */
  showDescription?: boolean;
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
  /** How the cook chose to order recipes within each section. A property of the
      BOOK, not of the browser looking at it: "A-Z" is a standing instruction
      that keeps sorting as recipes are added and retitled, so it has to come
      back with the book on another day or another device. Absent = "custom",
      which is every project saved before this and every hand-arranged one. */
  railSortMode?: RailSortMode;
}

/**
 * Everything cookbook-specific that switching back to recipe cards sets aside,
 * so returning to the book restores it rather than making the cook rebuild it.
 *
 * This is persisted with the project on purpose. The stash lives in session
 * metadata while you work, but "switch to cards" also detaches the working copy
 * onto a fresh project id — so without carrying the stash into the saved
 * document, reopening that card project later found no stash and silently
 * scaffolded a brand-new book instead of restoring the one that was set aside.
 * Only ids and organizational fields, so it stays small.
 */
export interface StashedCookbook {
  cover?: CoverConfig;
  backCover?: CoverConfig;
  dedication?: CoverConfig;
  frontMatter?: CookbookFrontMatter;
  photoStyle?: "none" | "card" | "full";
  tableOfContents?: boolean;
  tocKicker?: string;
  tocTitle?: string;
  railSortMode?: RailSortMode;
  sectionDividers?: boolean;
  cookbookPreset?: CookbookPresetId;
  sections: SectionMeta[];
  itemPlacements?: Record<string, RecipePagePlacement>;
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
  /** A book set aside by switching this project to recipe cards. See
      `StashedCookbook`. Absent for projects that were never a cookbook. */
  stashedCookbook?: StashedCookbook;
  createdAt: number;
  updatedAt: number;
}
