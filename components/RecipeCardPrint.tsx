"use client";

import {
  Fragment,
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatRecipeTime } from "@/lib/time";
import { photoGridLayout } from "@/lib/photoGrid";
import { ImagePicker } from "@/components/ImagePicker";
import { useWideColumns } from "@/lib/measureHeights";
import {
  buildColumnChunks,
  getRecipeFaces,
  ingredientText,
  metaBits,
  recipeNeedsBackSide,
  sectionGroups,
  sourceLabel,
  type ColumnChunk,
  type RecipeCardEditTarget,
  type RecipeCardInlineEdit,
  type RecipeFace,
  type RecipeFaces,
} from "@/lib/recipeCardLayout";
import type { CoverConfig, Recipe } from "@/types/recipe";
import { markImageAvailable, markImageUnavailable } from "@/lib/imageFailure";

// Layout-budget engine (the character-cost heuristics that decide what fits on
// a front/back face) lives in lib/recipeCardLayout.ts — this file re-exports
// its public surface so existing imports from "@/components/RecipeCardPrint"
// keep working unchanged.
export {
  getRecipeFaces,
  recipeNeedsBackSide,
  type RecipeCardEditTarget,
  type RecipeCardInlineEdit,
  type RecipeFace,
  type RecipeFaces,
};

// Printable recipe layouts. Compact cards keep readable text and move overflow
// to a second side instead of squeezing the whole recipe smaller and smaller.

export type PrintCardSize = "letter" | "card-6x4";

export const PRINT_CARD_SIZE_OPTIONS: Array<{
  id: PrintCardSize;
  label: string;
  detail: string;
}> = [
  { id: "letter", label: "Full page", detail: "Letter paper" },
  { id: "card-6x4", label: "6 x 4 card", detail: "Landscape recipe card" },
];

/** The `.recipe-print-preview--*` class for a card size — applied by anything
    rendering a card (preview AND the off-screen measurer) so measurement matches
    what prints. */
export function previewSizeClass(size: PrintCardSize): string {
  return `recipe-print-preview--${size}`;
}

export type RecipePrintTemplate =
  | "classic"
  | "heirloom"
  | "bistro"
  | "pantry"
  | "counter"
  | "keepsake"
  | "fruit"
  | "cookout";
export type CardSectionLayout = "standard" | "stacked";

export const RECIPE_PRINT_TEMPLATE_OPTIONS: Array<{
  id: RecipePrintTemplate;
  label: string;
  detail: string;
}> = [
  { id: "classic", label: "Classic", detail: "Bright blue, clean cookbook card" },
  { id: "pantry", label: "Pantry", detail: "Fine ruled lines with small ingredient sketches" },
  { id: "counter", label: "Counter", detail: "Black-and-white notes with tiny counter details" },
  { id: "heirloom", label: "Heirloom", detail: "Cream stock, red utensil keepsake" },
  { id: "keepsake", label: "Keepsake", detail: "Cream recipe-box card with classic family style" },
  { id: "bistro", label: "Bistro", detail: "Blue checks, tomato red, playful kitchen card" },
  // Fruit Stand and Cookout are withheld from the picker for now — not ready to
  // launch. Only this list is gated: the `fruit`/`cookout` template ids, their
  // styles and premium mappings all stay, so a project already saved on one keeps
  // rendering (and printing) exactly as before instead of falling back to a
  // different look. Re-launching either is a one-line restore.
  // { id: "cookout", label: "Cookout", detail: "Warm BBQ card with a grilled-icon border" },
];

// A BBQ-icon border for the cookout template, running continuously along
// all four edges (`justify-content: space-evenly` in globals.css, so it
// actually reads as a full border rather than a few clusters with bare card
// between them). Each icon still varies independently in size (`scale`,
// against the edge's base thickness via `--icon-scale`), rotation, an
// occasional horizontal flip, and a small perpendicular `jitter` (in
// inches, nudging it off the strip's centerline) so the even center-to-
// center spacing doesn't read as a mechanical, perfectly-repeating strip.
interface BbqIcon {
  src: string;
  rotate: number;
  flip?: boolean;
  scale?: number;
  /** Perpendicular offset off the strip's centerline, in inches. */
  jitter?: number;
  /** Relative weight of the flexible space *before* this icon. The strip's
      leftover room is shared out to these weights, so the gap ahead of every
      icon is genuinely different (not an even grid) — and a weight of 0 tucks
      the icon right up against its neighbour to read as a deliberate cluster. */
  gap?: number;
}

// Every `gap` is a different weight so the space ahead of each icon differs —
// no even grid. The 0s are deliberate clusters (two icons tucked together),
// which is the "some go together, then a different gap" rhythm of the reference
// card. Scales vary too, and nothing is pinned to a corner.
const BBQ_EDGE_TOP: BbqIcon[] = [
  { src: "/images/bbq-grill.svg", rotate: -9, scale: 1.05, jitter: 0.03, gap: 0.5 },
  { src: "/images/bbq-steak.svg", rotate: 13, flip: true, scale: 0.8, jitter: -0.04, gap: 0 },
  { src: "/images/bbq-kabob.svg", rotate: -7, scale: 0.72, jitter: 0.05, gap: 1.9 },
  { src: "/images/bbq-tomato.svg", rotate: 11, scale: 0.78, jitter: -0.02, gap: 1.1 },
  { src: "/images/bbq-tools.svg", rotate: 9, scale: 0.95, jitter: -0.03, gap: 2.3 },
  { src: "/images/bbq-steak.svg", rotate: -13, flip: true, scale: 0.82, jitter: 0.03, gap: 0 },
  { src: "/images/bbq-sauce.svg", rotate: 7, scale: 0.78, jitter: -0.03, gap: 1.5 },
  { src: "/images/bbq-kabob.svg", rotate: -15, flip: true, scale: 0.7, jitter: 0.03, gap: 0.8 },
];
const BBQ_EDGE_BOTTOM: BbqIcon[] = [
  { src: "/images/bbq-tools.svg", rotate: -12, flip: true, scale: 1.0, jitter: -0.03, gap: 1.3 },
  { src: "/images/bbq-steak.svg", rotate: 10, scale: 0.82, jitter: 0.02, gap: 2.1 },
  { src: "/images/bbq-kabob.svg", rotate: 14, scale: 0.7, jitter: 0.03, gap: 0 },
  { src: "/images/bbq-tomato.svg", rotate: -9, scale: 0.78, jitter: -0.02, gap: 1.7 },
  { src: "/images/bbq-grill.svg", rotate: 8, flip: true, scale: 1.02, jitter: 0.03, gap: 0.9 },
  { src: "/images/bbq-steak.svg", rotate: 9, scale: 0.82, jitter: 0.02, gap: 2.4 },
  { src: "/images/bbq-sauce.svg", rotate: -11, scale: 0.78, jitter: -0.02, gap: 0 },
  { src: "/images/bbq-kabob.svg", rotate: -15, flip: true, scale: 0.7, jitter: -0.03, gap: 1.4 },
];
const BBQ_EDGE_LEFT: BbqIcon[] = [
  { src: "/images/bbq-grill.svg", rotate: -9, scale: 1.02, jitter: 0.03, gap: 0.7 },
  { src: "/images/bbq-steak.svg", rotate: 13, flip: true, scale: 0.82, jitter: -0.04, gap: 2.2 },
  { src: "/images/bbq-kabob.svg", rotate: -7, scale: 0.72, jitter: 0.03, gap: 0 },
  { src: "/images/bbq-tools.svg", rotate: 10, scale: 0.95, jitter: -0.03, gap: 1.6 },
  { src: "/images/bbq-tomato.svg", rotate: 11, scale: 0.78, jitter: 0.03, gap: 1.0 },
  { src: "/images/bbq-sauce.svg", rotate: 8, scale: 0.78, jitter: -0.04, gap: 2.0 },
];
const BBQ_EDGE_RIGHT: BbqIcon[] = [
  { src: "/images/bbq-steak.svg", rotate: 9, scale: 0.82, jitter: -0.03, gap: 1.2 },
  { src: "/images/bbq-kabob.svg", rotate: -12, flip: true, scale: 0.72, jitter: 0.04, gap: 0 },
  { src: "/images/bbq-grill.svg", rotate: 8, flip: true, scale: 1.02, jitter: -0.03, gap: 2.3 },
  { src: "/images/bbq-tools.svg", rotate: 6, flip: true, scale: 0.95, jitter: -0.02, gap: 0.9 },
  { src: "/images/bbq-tomato.svg", rotate: 10, scale: 0.78, jitter: -0.03, gap: 1.8 },
  { src: "/images/bbq-sauce.svg", rotate: -8, flip: true, scale: 0.78, jitter: 0.02, gap: 1.4 },
];

// A tiled SVG `<pattern>` (not a background-image tile, which Chrome's print
// pipeline pre-rasterizes to a low-DPI bitmap). Pure vector, so it stays crisp
// at any print DPI — EXCEPT when an ancestor `transform: scale()` flattens it to
// a bitmap first. The cookbook export scales the card to fill the sheet, so for
// a SPIRAL book (a real ~1.03 scale) the in-card spine is rendered a second time
// at the page level, OUTSIDE that transform, via `className="recipe-card-page__
// spine"` (see the `.rp-coil` rules in print.css); hardcover's scale is exactly
// 1.0 and its transform is dropped, so its in-card spine stays crisp as-is.
//
// The tile size is passed via the `check` prop and emitted as SVG attributes
// (NOT CSS — browsers ignore width/height set via CSS on a `<pattern>`). The
// pattern id is per-instance so the many spines in the deck don't collide.
export function BistroCheckerSpine({
  className = "recipe-card__checker",
  check = "0.24in",
}: { className?: string; check?: string } = {}) {
  const patternId = useId();
  // The tile size MUST live on SVG attributes, not CSS: browsers ignore
  // `width`/`height` set via CSS on an SVG `<pattern>` element (they only work
  // as presentation attributes), which silently collapses the pattern and
  // paints nothing. Drive the geometry off the `check` prop so the tile can be
  // sized per-instance (e.g. a wider tile on a spiral binding spine).
  const half = `calc(${check} / 2)`;
  return (
    <div className={className} aria-hidden>
      <svg width="100%" height="100%" focusable="false">
        <defs>
          <pattern id={patternId} width={check} height={check} patternUnits="userSpaceOnUse">
            <rect width={check} height={check} fill="#f8fffe" />
            <rect x={half} width={half} height={half} fill="#1479c9" />
            <rect y={half} width={half} height={half} fill="#1479c9" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

// Same reasoning as `BistroCheckerSpine` above: real vector rects instead of
// the tiled CSS `background-image` gradient this used to be, which printed
// crisply on screen but got pre-rasterized to a fixed, low DPI bitmap by
// Chrome's print/PDF pipeline — the exact bug that made bistro's spine
// blocky before it was switched to SVG. 60 teeth comfortably covers the
// widest card (11in letter) at 0.16in per tooth; any extra is clipped by the
// container's own `overflow: hidden`, sized to the card by CSS.
// The band's three horizontal zones (top teeth, solid middle, bottom teeth)
// are equal thirds, not a thick solid core with thin teeth — an earlier
// version made the solid third 3x taller than the teeth, which read as a much
// heavier bar. (The theme picker now renders this real card shrunk down, so
// there's no separate mockup to keep this in sync with.)
const COUNTER_BAND_TEETH = 60;
const COUNTER_BAND_TOOTH = 0.16;
const COUNTER_BAND_THIRD = 0.08;
const COUNTER_BAND_COLOR = "#2f2f2f";

/* Letters, not rules. Stacked lines read as text ALIGNMENT — the toolbar
   convention for left/centre/right — which is the wrong question entirely.
   "Aa" and "H" are how every editor says body versus heading.

   Exported because the switch itself now lives in the page toolbar (see
   PrintDeck's `renderLineKindControl`) rather than above the field. The glyphs
   stay here, next to the card they describe. */
export function BodyTextGlyph() {
  return <span className="recipe-card__line-kind-glyph" aria-hidden>Aa</span>;
}

export function HeadingGlyph() {
  return (
    <span className="recipe-card__line-kind-glyph recipe-card__line-kind-glyph--heading" aria-hidden>
      H
    </span>
  );
}

function CounterCheckerBand() {
  const teeth = Array.from({ length: COUNTER_BAND_TEETH }, (_, i) => i);
  return (
    <div className="recipe-card__counter-band" aria-hidden>
      <svg width="100%" height="100%" focusable="false">
        <rect
          x="0"
          y={`${COUNTER_BAND_THIRD}in`}
          width="100%"
          height={`${COUNTER_BAND_THIRD}in`}
          fill={COUNTER_BAND_COLOR}
        />
        {teeth.map((i) => (
          <rect
            key={`top-${i}`}
            x={`${i * COUNTER_BAND_TOOTH}in`}
            y="0"
            width={`${COUNTER_BAND_TOOTH / 2}in`}
            height={`${COUNTER_BAND_THIRD}in`}
            fill={COUNTER_BAND_COLOR}
          />
        ))}
        {teeth.map((i) => (
          <rect
            key={`bottom-${i}`}
            x={`${COUNTER_BAND_TOOTH / 2 + i * COUNTER_BAND_TOOTH}in`}
            y={`${COUNTER_BAND_THIRD * 2}in`}
            width={`${COUNTER_BAND_TOOTH / 2}in`}
            height={`${COUNTER_BAND_THIRD}in`}
            fill={COUNTER_BAND_COLOR}
          />
        ))}
      </svg>
    </div>
  );
}

// `axis` says which direction this icon's edge runs, so `jitter` (always
// "perpendicular to the strip") lands on the right transform axis: a
// horizontal top/bottom strip jitters vertically, a vertical left/right one
// jitters horizontally.
function BbqIconImg({ icon, axis, iconKey }: { icon: BbqIcon; axis: "x" | "y"; iconKey: string }) {
  const jitter = icon.jitter ?? 0;
  const translate = axis === "y" ? `translateY(${jitter}in)` : `translateX(${jitter}in)`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={iconKey}
      className="recipe-card__bbq-icon"
      src={icon.src}
      alt=""
      style={
        {
          transform: `${translate} rotate(${icon.rotate}deg)${icon.flip ? " scaleX(-1)" : ""}`,
          "--icon-scale": icon.scale ?? 1,
        } as CSSProperties
      }
    />
  );
}

// Target center-to-center spacing between border icons, in CSS inches (where
// 1in === 96px, regardless of paper size or print DPI). Each edge's icon
// *count* is derived from its own measured length against this, so the tall
// letter card's long sides stay as densely filled as its short top/bottom
// instead of stranding four lonely icons down an 11-inch run — while a short
// 6x4 landscape side, measured the same way, simply gets fewer.
const BBQ_ICON_SPACING_IN = 0.52;
const CSS_PX_PER_IN = 96;

// `typeof window` picks `useEffect` on the server so the layout-effect warning
// never fires during SSR; on the client `useLayoutEffect` sets the real count
// before paint, so the strip never flashes its unmeasured default first.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Measures a strip's length and repeats the edge's base icon list (cycling
// through it so rotation/flip/jitter/gap keep varying) to fill it at roughly
// `BBQ_ICON_SPACING_IN`. Between and around the icons sit flexible spacers
// whose `flex-grow` is the upcoming icon's `gap` weight, so flexbox shares the
// strip's leftover room out unevenly — the space before each icon genuinely
// differs, and a 0-weight spacer collapses so two icons cluster. The strip is
// absolutely positioned and `pointer-events: none`, so re-rendering more icons
// never touches the card's content flow or the pagination measurement.
function BbqEdge({
  side,
  base,
}: {
  side: "top" | "bottom" | "left" | "right";
  base: BbqIcon[];
}) {
  const horizontal = side === "top" || side === "bottom";
  const ref = useRef<HTMLDivElement | null>(null);
  const [count, setCount] = useState(base.length);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // `offsetWidth`/`offsetHeight` (not `getBoundingClientRect`) so the count
      // comes from the card's intrinsic print-space size, not its on-screen
      // size: previews and thumbnails are the same full-size card shrunk with
      // `transform: scale()`, which `getBoundingClientRect` would report at the
      // scaled size — handing each a different icon count and making the
      // preview diverge from the print. `offset*` ignores the transform, so
      // every instance (thumbnail, preview, printed page) measures identically.
      const lengthPx = horizontal ? el.offsetWidth : el.offsetHeight;
      // 0 while the face is hidden (`display: none` decks) — leave the current
      // count and let the ResizeObserver re-measure once it's actually shown.
      if (lengthPx === 0) return;
      const next = Math.round(lengthPx / CSS_PX_PER_IN / BBQ_ICON_SPACING_IN);
      setCount(Math.max(3, next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [horizontal]);

  return (
    <div ref={ref} className={`recipe-card__bbq-edge recipe-card__bbq-edge--${side}`}>
      {Array.from({ length: count }, (_, i) => {
        const icon = base[i % base.length];
        return (
          <Fragment key={`${side}-${i}`}>
            <span className="recipe-card__bbq-gap" style={{ flexGrow: icon.gap ?? 1 }} />
            <BbqIconImg iconKey={`${side}-${i}`} icon={icon} axis={horizontal ? "y" : "x"} />
          </Fragment>
        );
      })}
      {/* Trailing spacer so the last icon isn't jammed against the far corner. */}
      <span className="recipe-card__bbq-gap" style={{ flexGrow: 1.3 }} />
    </div>
  );
}

// Shared by RecipeCardFace, DividerFace, and CoverFace so section dividers
// and covers pick up the same cookout border instead of going bare.
// `withPhotoGap` is only relevant on a recipe front face — it pulls the top
// and right strips back so they don't run under the corner photo thumbnail.
// No dedicated corner icons: an earlier version pinned a grill to each corner,
// but that read as too rigidly, symmetrically "framed" — the reference card
// isn't cornered like that. The strips just run edge to edge and the corners
// are whatever their end icons happen to be.
function CookoutBbqBorder({ withPhotoGap = false }: { withPhotoGap?: boolean }) {
  return (
    <div
      className={`recipe-card__bbq-border ${withPhotoGap ? "recipe-card__bbq-border--with-photo" : ""}`}
      aria-hidden
    >
      <BbqEdge side="top" base={BBQ_EDGE_TOP} />
      <BbqEdge side="bottom" base={BBQ_EDGE_BOTTOM} />
      <BbqEdge side="left" base={BBQ_EDGE_LEFT} />
      <BbqEdge side="right" base={BBQ_EDGE_RIGHT} />
    </div>
  );
}

/**
 * The template's decorative layer — the one part of a card that is pure
 * ornament, and by far the most expensive: bistro's checker spine is 240 SVG
 * nodes per face, cookout's border ~40 `<img>`s plus four ResizeObservers.
 *
 * `show={false}` drops it entirely, for the two places that render a full card
 * but never display this layer:
 *   - RecipeFaceMeasurer, which is `visibility: hidden` and only ever reads
 *     `.recipe-card__cols` geometry (see lib/faceMeasure.ts) — decoration is
 *     absolutely positioned and contributes nothing to what it measures.
 *   - the rail thumbnails, drawn at ~1/11 scale where a 0.24in motif lands
 *     under a pixel; print.css paints a flat stand-in there instead.
 * Both used to pay full price for a layer neither one shows. Measured on a
 * 60-recipe project in Bistro, that was 36,660 of 55,967 total DOM nodes.
 *
 * Centralized here rather than repeated at each of the three faces below so
 * "which templates have a decorative layer" is stated once.
 */
function TemplateDecoration({
  template,
  show = true,
  continued = false,
  withPhotoGap = false,
}: {
  template?: RecipePrintTemplate;
  show?: boolean;
  /** Cookout's border is a front-face motif; continuation faces go without. */
  continued?: boolean;
  withPhotoGap?: boolean;
}) {
  if (!show) return null;
  if (template === "bistro") return <BistroCheckerSpine />;
  if (template === "counter") return <CounterCheckerBand />;
  if (template === "cookout" && !continued) return <CookoutBbqBorder withPhotoGap={withPhotoGap} />;
  return null;
}

export const RecipeCardFace = memo(function RecipeCardFace({
  recipe,
  ingredients,
  instructions,
  side,
  showHeader,
  layout,
  hasBackFace,
  previewHidden = false,
  blank = false,
  showImage = false,
  photoOnFacingPage = false,
  showSourceUrl = false,
  continued = false,
  contentScale,
  inlineEdit,
  template,
  showDecoration = true,
  cookbookMode = false,
}: {
  recipe: Recipe;
  ingredients: Recipe["ingredients"];
  instructions: Recipe["instructions"];
  side: "front" | "back";
  showHeader: boolean;
  layout: CardSectionLayout;
  hasBackFace: boolean;
  previewHidden?: boolean;
  blank?: boolean;
  showImage?: boolean;
  /** This recipe's photo fills its own facing page (cookbook image-spread), so
      the card must NOT offer an in-card "Add photo" — the photo (and its
      "Change photo" control) live on the image page. */
  photoOnFacingPage?: boolean;
  showSourceUrl?: boolean;
  continued?: boolean;
  /** Shrink-to-fit factor for this face's content — see `RecipeFace.contentScale`. */
  contentScale?: number;
  inlineEdit?: RecipeCardInlineEdit;
  template?: RecipePrintTemplate;
  /** See `TemplateDecoration` — false on surfaces that never show it. */
  showDecoration?: boolean;
  /** Cookbook mode: the source link moves up under the title's meta line (so it
      doesn't compete with the page-number folio), and the "Printed with
      RecipePrinter" footer is dropped entirely — even on free templates. */
  cookbookMode?: boolean;
}) {
  const source = sourceLabel(recipe);
  const meta = metaBits(recipe);
  const canEdit = Boolean(inlineEdit);
  // While editing, a section with nothing in it yet still gets a slot (with
  // just an "Add ingredient"/"Add step" prompt) so there's somewhere to
  // start — otherwise an empty recipe would never get past its first field.
  const showEmptyIngredients = canEdit && recipe.ingredients.length === 0;
  const showEmptyInstructions = canEdit && recipe.instructions.length === 0;
  const hasIngredientsSection = ingredients.length > 0 || showEmptyIngredients;
  const hasInstructionsSection = instructions.length > 0 || showEmptyInstructions;
  const ingredientsOnly = hasIngredientsSection && !hasInstructionsSection;
  const methodOnly = hasInstructionsSection && !hasIngredientsSection;
  const stackedLayout = layout === "stacked";
  const ingredientGroups = sectionGroups(ingredients);
  const instructionGroups = sectionGroups(instructions);
  const ingredientsWide = ingredientsOnly || stackedLayout;
  const methodWide = methodOnly || stackedLayout;
  // Chunks are the placeable units for the two-column split below: a group's
  // title glued to its first item (so it's never stranded alone at the foot
  // of a column), every other item on its own. See `useWideColumns` for why
  // this replaced CSS `column-count`/`column-fill: balance` — that's
  // unreliable specifically on iOS's print rendering path.
  const ingredientChunks = useMemo(
    () => buildColumnChunks(ingredientGroups, (item) => recipe.ingredients.indexOf(item)),
    [ingredientGroups, recipe.ingredients],
  );
  const instructionChunks = useMemo(
    () => buildColumnChunks(instructionGroups, (item) => recipe.instructions.indexOf(item)),
    [instructionGroups, recipe.instructions],
  );
  const ingredientColumns = useWideColumns(ingredientsWide, ingredientChunks.length, ingredients);
  const methodColumns = useWideColumns(methodWide, instructionChunks.length, instructions);
  // The photo only rides along on the front face (where the header lives). If
  // the source image 404s or is hotlink-blocked we drop it rather than print a
  // broken-image box.
  const showPhoto = showHeader && (showImage && Boolean(recipe.image));
  // No photo yet, but this card could take one: the "Add photo" control stands
  // in for the missing thumbnail. It sits in the photo's own corner of the
  // header (see `--with-photo-add`) rather than loose under the meta line,
  // where it read as a stray button with no relationship to anything.
  const showPhotoAdd =
    showHeader && !cookbookMode && !showPhoto && !photoOnFacingPage && canEdit && Boolean(inlineEdit);
  /* A cookbook's photo control, which is NOT conditional on there already
     being a photo — that was the bug. It hung off `showPhoto`, which requires
     `recipe.image`, so a recipe that arrived without one showed no photo
     affordance at all while editing: nothing to press, and therefore no way to
     add the photo that would have made the control appear. Recipe-cards mode
     never had this hole; it has `showPhotoAdd` for exactly this case.
     Suppressed only when the photo has a page of its own, where the control
     belongs on that page instead (see `imageEdit`). */
  const showCookbookPhotoEdit =
    showHeader && cookbookMode && !photoOnFacingPage && canEdit && Boolean(inlineEdit);

  // Shrink-to-fit for content pagination can't rescue (see
  // `RecipeFace.contentScale`). Laid out at `1 / scale` of the normal width and
  // then scaled back down, so text re-wraps at the wider measure and lands at
  // the same visual width — a plain `transform` alone would just shrink the
  // block and leave a gap down the side. Deliberately a transform on the whole
  // content block rather than a smaller font-size: the type scale lives in
  // print.css custom properties that every template overrides, so scaling one
  // number here would silently desynchronise from a template's own sizing.
  const shrinkStyle: CSSProperties | undefined =
    contentScale && contentScale < 1
      ? {
          transform: `scale(${contentScale})`,
          transformOrigin: "top left",
          width: `${100 / contentScale}%`,
        }
      : undefined;

  // Whole-page edit mode means every field is a live input at once (see
  // togglePageEditMode in app/print/page.tsx) — there's no separate
  // select-then-edit step, so this only needs to tell the currently-focused
  // field apart from the rest (to know whether to show the shared draft
  // value or the field's live committed value).
  function sameTarget(a: RecipeCardEditTarget | null | undefined, b: RecipeCardEditTarget): boolean {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === "ingredient" && b.kind === "ingredient") return a.index === b.index;
    if (a.kind === "step" && b.kind === "step") return a.index === b.index;
    if (a.kind === "ingredientSection" && b.kind === "ingredientSection") return a.index === b.index;
    if (a.kind === "instructionSection" && b.kind === "instructionSection") return a.index === b.index;
    return true;
  }

  function startEdit(target: RecipeCardEditTarget, value: string) {
    inlineEdit?.onFocusTarget(target, value);
  }

  function commitEdit() {
    inlineEdit?.onCommit();
  }

  function renderCookbookDescription() {
    if (!cookbookMode || !showHeader) return null;
    if (canEdit && inlineEdit) {
      return (
        <textarea
          rows={1}
          className="recipe-card__inline-textarea recipe-card__headnote"
          value={
            sameTarget(inlineEdit.editingTarget, { kind: "description" })
              ? inlineEdit.value
              : recipe.description ?? ""
          }
          placeholder="Add a note or memory…"
          aria-label="Recipe description"
          onFocus={() => startEdit({ kind: "description" }, recipe.description ?? "")}
          onChange={(event) => inlineEdit.onValueChange(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={(event) => handleEditKeyDown(event, { kind: "description" })}
        />
      );
    }
    return recipe.description ? (
      <p className="recipe-card__headnote">{recipe.description}</p>
    ) : null;
  }

  function renderCookbookFacts() {
    if (!cookbookMode) return null;
    const time = formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime) || "";
    const servings = recipe.servings ?? recipe.yield;
    if (!canEdit && !time && !servings) return null;

    return (
      <div className="recipe-card__facts" aria-label="Recipe details">
        {(canEdit || time) && (
          <span className="recipe-card__fact">
            <span className="recipe-card__fact-label">Cook time</span>
            {canEdit && inlineEdit ? (
              <input
                className="recipe-card__inline-input recipe-card__fact-value"
                value={
                  sameTarget(inlineEdit.editingTarget, { kind: "cookTime" })
                    ? inlineEdit.value
                    : time
                }
                placeholder="Add time"
                aria-label="Cook time"
                onFocus={() =>
                  startEdit(
                    { kind: "cookTime" },
                    recipe.totalTime || recipe.cookTime || recipe.prepTime || "",
                  )
                }
                onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              <strong className="recipe-card__fact-value">{time}</strong>
            )}
          </span>
        )}
        {(canEdit || servings) && (
          <span className="recipe-card__fact">
            <span className="recipe-card__fact-label">Serves</span>
            {canEdit && inlineEdit ? (
              <input
                className="recipe-card__inline-input recipe-card__fact-value"
                value={
                  sameTarget(inlineEdit.editingTarget, { kind: "servings" })
                    ? inlineEdit.value
                    : servings
                      ? String(servings)
                      : ""
                }
                placeholder="Add count"
                aria-label="Servings"
                onFocus={() =>
                  startEdit(
                    { kind: "servings" },
                    recipe.servings === undefined ? "" : String(recipe.servings),
                  )
                }
                onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              <strong className="recipe-card__fact-value">{String(servings)}</strong>
            )}
          </span>
        )}
      </div>
    );
  }

  function handleEditKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    target?: RecipeCardEditTarget,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      inlineEdit?.onCancel();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Ingredients/steps split at the cursor instead of committing the
      // whole field, so Enter behaves like it does in any text editor.
      if (inlineEdit && target && (target.kind === "ingredient" || target.kind === "step")) {
        const el = event.currentTarget;
        const cursor = el.selectionStart ?? el.value.length;
        inlineEdit.onSplitLine(target, el.value.slice(0, cursor), el.value.slice(cursor));
        return;
      }
      event.currentTarget.blur();
    }
  }

  // A freshly-inserted blank line has nothing for the user to have clicked
  // (it didn't exist a moment ago), so it never picks up real browser focus
  // on its own — this ref callback claims it once, the moment its element
  // mounts. `.focus()` on an already-focused element is a no-op, so reusing
  // this on every render (including while the user types) is safe.
  function focusIfEditing(target: RecipeCardEditTarget) {
    return (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (el && inlineEdit && sameTarget(inlineEdit.editingTarget, target) && document.activeElement !== el) {
        el.focus();
      }
    };
  }

  function insertIngredientAt(index: number) {
    inlineEdit?.onInsertIngredient(index);
  }

  function insertStepAt(index: number) {
    inlineEdit?.onInsertStep(index);
  }

  // The between-row action appears only after its row has hover/focus. This
  // preserves exact insertion without making the whole gap a click target.
  function addLine(kind: "ingredient" | "step", index: number, variant: "between" | "empty" = "between") {
    if (!canEdit || !inlineEdit) return null;
    const label = kind === "ingredient" ? "Add ingredient" : "Add step";
    return (
      <button
        type="button"
        className={`recipe-card__add-line no-print ${
          variant === "empty" ? "recipe-card__add-line--empty" : ""
        }`}
        aria-label={label}
        /**
         * `onMouseDown` with `preventDefault`, not `onClick`.
         *
         * A click blurs the field first, which commits the row being edited and
         * clears the editor's in-progress state — so the insert then ran against
         * whichever of those two updates React had applied, and the row above
         * came back duplicated. Holding focus removes the race entirely: the
         * insert reads the live edit, writes it, and puts the caret in the new
         * blank row itself.
         */
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (kind === "ingredient") insertIngredientAt(index);
          else insertStepAt(index);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="recipe-card__add-line-text">{variant === "empty" ? `+ ${label}` : "+ Add below"}</span>
      </button>
    );
  }

  function sectionTitle(
    kind: "ingredientSection" | "instructionSection",
    index: number,
    title: string,
  ) {
    if (!canEdit || !inlineEdit) {
      return <h3 className="recipe-card__section-title">{title}</h3>;
    }
    const target: RecipeCardEditTarget = { kind, index };
    const isEditingThis = sameTarget(inlineEdit.editingTarget, target);
    // Unlike ingredient/step lines (real fields the whole time edit mode is
    // on), this one only becomes a real <input> while it's the active field.
    // Mounting a permanent field here — even one whose box is pixel-
    // identical to the <h3> it replaces — is exactly the kind of structural
    // change `useWideColumns`' measurement re-runs on, so it's avoidable
    // churn to mount one for every idle title. Kept on-demand for that
    // reason, not because it would break the column split itself.
    if (!isEditingThis) {
      return (
        <h3
          className="recipe-card__section-title recipe-card__section-title--editable"
          onClick={() => startEdit(target, title)}
        >
          {title}
        </h3>
      );
    }
    return (
      /* Still a heading being edited, and the toolbar's line-kind switch is
         what turns it back into a line — the conversion stays two-way, it just
         happens in the bar rather than in a control pinned over the card. */
      <span className="recipe-card__section-title-edit">
        <textarea
          ref={focusIfEditing(target)}
          className="recipe-card__inline-textarea recipe-card__section-title"
          rows={1}
          value={inlineEdit.value}
          aria-label="Section title"
          onChange={(event) => inlineEdit.onValueChange(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleEditKeyDown}
        />
      </span>
    );
  }

  function renderIngredientItem(ing: Recipe["ingredients"][number], index: number): ReactNode {
    const target: RecipeCardEditTarget = { kind: "ingredient", index };
    const text = ingredientText(ing);
    const isEditingThis = inlineEdit && sameTarget(inlineEdit.editingTarget, target);
    const displayValue = isEditingThis ? inlineEdit!.value : text;
    return (
      <li key={index} className="recipe-card__editable-line">
        {canEdit && inlineEdit ? (
          <textarea
            ref={focusIfEditing(target)}
            className="recipe-card__inline-textarea recipe-card__inline-textarea--line"
            value={displayValue}
            aria-label="Ingredient"
            rows={Math.max(1, displayValue.split(/\r?\n/).length)}
            onFocus={() => startEdit(target, text)}
            onChange={(event) => inlineEdit.onValueChange(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={(event) => handleEditKeyDown(event, target)}
          />
        ) : (
          text
        )}
        {!isEditingThis && addLine("ingredient", index + 1)}
      </li>
    );
  }

  // View-mode-only rendering used solely for the hidden measurement probe
  // (see `useWideColumns`) — never a live textarea, so there's no risk of a
  // second ref/focus target fighting the real, visible one for the same
  // underlying item while it's actively being edited.
  function renderIngredientProbeItem(ing: Recipe["ingredients"][number]): ReactNode {
    return <li className="recipe-card__editable-line">{ingredientText(ing)}</li>;
  }

  function renderInstructionItem(step: Recipe["instructions"][number], index: number): ReactNode {
    const target: RecipeCardEditTarget = { kind: "step", index };
    const isEditingThis = inlineEdit && sameTarget(inlineEdit.editingTarget, target);
    const displayValue = isEditingThis ? inlineEdit!.value : step.text;
    return (
      <li key={`${step.step}-${step.text.slice(0, 24)}`} className="recipe-card__editable-line">
        <span className="recipe-card__step-number">{step.step}</span>
        {canEdit && inlineEdit ? (
          <textarea
            ref={focusIfEditing(target)}
            className="recipe-card__inline-textarea recipe-card__inline-textarea--line"
            value={displayValue}
            aria-label="Step"
            rows={Math.max(1, displayValue.split(/\r?\n/).length)}
            onFocus={() => startEdit(target, step.text)}
            onChange={(event) => inlineEdit.onValueChange(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={(event) => handleEditKeyDown(event, target)}
          />
        ) : (
          <span>{step.text}</span>
        )}
        {!isEditingThis && addLine("step", index + 1)}
      </li>
    );
  }

  // See `renderIngredientProbeItem` — view-mode-only, measurement probe use only.
  function renderInstructionProbeItem(step: Recipe["instructions"][number]): ReactNode {
    return (
      <li className="recipe-card__editable-line">
        <span className="recipe-card__step-number">{step.step}</span>
        <span>{step.text}</span>
      </li>
    );
  }

  // Renders one column's slice of chunks (see `buildColumnChunks`), grouping
  // consecutive same-group chunks back into `.recipe-card__section-group`
  // wrappers. A group whose title-bearing chunk landed in the *other*
  // column renders here title-less — it's a continuation, not a new section.
  function renderChunkGroups<T>(
    chunks: ColumnChunk<T>[],
    renderItem: (item: T, index: number) => ReactNode,
    titleKind: "ingredientSection" | "instructionSection",
    ListTag: "ul" | "ol",
  ): ReactNode {
    const blocks: ReactNode[] = [];
    let openGroupId: number | null = null;
    let items: ReactNode[] = [];
    let title: string | undefined;
    let titleIndex = 0;

    function flush() {
      if (items.length === 0) return;
      blocks.push(
        <div className="recipe-card__section-group" key={`group-${openGroupId}`}>
          {title !== undefined && sectionTitle(titleKind, titleIndex, title)}
          <ListTag>{items}</ListTag>
        </div>,
      );
      items = [];
      title = undefined;
    }

    chunks.forEach((chunk) => {
      if (openGroupId !== null && chunk.groupId !== openGroupId) flush();
      openGroupId = chunk.groupId;
      if (chunk.groupTitle !== undefined) {
        title = chunk.groupTitle;
        titleIndex = chunk.index;
      }
      items.push(renderItem(chunk.item, chunk.index));
    });
    flush();

    return blocks;
  }

  if (blank) {
    return (
      <article
        aria-hidden
        className="recipe-card recipe-card--back recipe-card--blank recipe-card--duplex-spacer"
        data-preview-hidden="true"
      />
    );
  }

  return (
    <article
      className={`recipe-card recipe-card--${side} ${
        continued ? "recipe-card--continued" : ""
      }`}
      data-has-back={hasBackFace ? "true" : undefined}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__accent" aria-hidden />
      <TemplateDecoration
        template={template}
        show={showDecoration}
        continued={continued}
        withPhotoGap={showPhoto}
      />
      {/* Cookbook in-card "Photo" button: at the card corner (not inside the
          small, clipped header photo), sized for the screen — opens the same
          placement + source dialog as the full-page image control. */}
      {showCookbookPhotoEdit && inlineEdit && (
        <ImagePicker
          current={recipe.image}
          images={inlineEdit.recipeImages ?? []}
          onSelect={(url) => inlineEdit.onImageChange(url ?? "")}
          placement={inlineEdit.photoPlacement}
          placementOptions={inlineEdit.photoPlacementOptions}
          onPlacementChange={inlineEdit.onPhotoPlacementChange}
          openSignal={inlineEdit.photoPromptSignal}
          /* Says which job it is doing: there is nothing to change yet when the
             recipe came in without a photo. */
          label={recipe.image ? "Photo" : "Add photo"}
          className="recipe-card__cook-photo-edit"
        />
      )}

      {showHeader ? (
        <header
          className={`recipe-card__header ${
            showPhoto ? "recipe-card__header--with-photo" : ""
          } ${showPhotoAdd ? "recipe-card__header--with-photo-add" : ""}`}
        >
          <div className="recipe-card__headline">
            {canEdit && inlineEdit ? (
              <textarea
                autoFocus
                className="recipe-card__inline-textarea recipe-card__title"
                rows={1}
                value={sameTarget(inlineEdit.editingTarget, { kind: "title" }) ? inlineEdit.value : recipe.title}
                aria-label="Recipe title"
                onFocus={() => startEdit({ kind: "title" }, recipe.title)}
                onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              <h1 className="recipe-card__title">{recipe.title}</h1>
            )}
            {/* Cookbook pages use an editorial header hierarchy: title,
                description, then cook time and servings. Plain recipe cards
                remain title → meta with no description added. */}
            {renderCookbookDescription()}
            {cookbookMode ? renderCookbookFacts() : canEdit && inlineEdit ? (
              <p className="recipe-card__meta recipe-card__meta--editable-targets">
                <input
                  className="recipe-card__inline-input recipe-card__inline-input--meta"
                  value={
                    sameTarget(inlineEdit.editingTarget, { kind: "cookTime" })
                      ? inlineEdit.value
                      : formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime) || ""
                  }
                  placeholder="Cook time"
                  aria-label="Cook time"
                  onFocus={() =>
                    startEdit({ kind: "cookTime" }, recipe.totalTime || recipe.cookTime || recipe.prepTime || "")
                  }
                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                />
                <span aria-hidden> · </span>
                <input
                  className="recipe-card__inline-input recipe-card__inline-input--meta"
                  value={
                    sameTarget(inlineEdit.editingTarget, { kind: "servings" })
                      ? inlineEdit.value
                      : recipe.servings ?? recipe.yield
                        ? `Serves ${recipe.servings ?? recipe.yield}`
                        : ""
                  }
                  placeholder="Servings"
                  aria-label="Servings"
                  onFocus={() =>
                    startEdit({ kind: "servings" }, recipe.servings === undefined ? "" : String(recipe.servings))
                  }
                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                />
              </p>
            ) : (
              meta.length > 0 && <p className="recipe-card__meta">{meta.join("  ·  ")}</p>
            )}
            {/* Cookbook mode: the source link lives here, right under the meta
                line, instead of in the footer where it competes with the page
                folio. Same content/edit target as the footer version below. */}
            {cookbookMode && showSourceUrl && showHeader && (
              canEdit && inlineEdit ? (
                <input
                  className="recipe-card__inline-input recipe-card__source-line"
                  value={
                    sameTarget(inlineEdit.editingTarget, { kind: "sourceUrl" })
                      ? inlineEdit.value
                      : recipe.sourceUrl ?? ""
                  }
                  placeholder="Add link"
                  aria-label="Source link"
                  onFocus={() => startEdit({ kind: "sourceUrl" }, recipe.sourceUrl ?? "")}
                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                />
              ) : (
                source && <p className="recipe-card__source-line">{source}</p>
              )
            )}
          </div>
          {showPhoto && (
            <span className={`recipe-card__photo ${canEdit ? "recipe-card__photo--editable" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="recipe-card__photo-img"
                src={recipe.image}
                alt={recipe.title ? `Photo of ${recipe.title}` : "Recipe photo"}
                loading="lazy"
                decoding="async"
                onLoad={(event) => markImageAvailable(event.currentTarget)}
                onError={(event) => markImageUnavailable(event.currentTarget)}
              />
              <span className="photo-unavailable-message">Photo unavailable</span>
              {/* Recipe-cards mode keeps its small in-frame "Change" control.
                  Cookbook mode uses the larger, unclipped "Photo" button at the
                  card corner below (this header photo is tiny + clipped). */}
              {!cookbookMode && canEdit && inlineEdit && (
                <ImagePicker
                  current={recipe.image}
                  images={inlineEdit.recipeImages ?? []}
                  onSelect={(url) => inlineEdit.onImageChange(url ?? "")}
                  label="Change"
                  className="recipe-card__photo-edit"
                />
              )}
            </span>
          )}
          {/* "Add photo" only belongs in plain recipe-cards mode; in a cookbook,
              adding/placing a photo is the job of the page's "Photo" dialog. */}
          {showPhotoAdd && inlineEdit && (
            <ImagePicker
              images={inlineEdit.recipeImages ?? []}
              onSelect={(url) => inlineEdit.onImageChange(url ?? "")}
              label="Add photo"
              className="recipe-card__photo-add"
            />
          )}
        </header>
      ) : null}

      <div
        className={`recipe-card__cols ${
          !hasIngredientsSection ? "recipe-card__cols--single" : ""
        } ${ingredientsOnly ? "recipe-card__cols--ingredients-only" : ""} ${
          methodOnly ? "recipe-card__cols--method-only" : ""
        } ${stackedLayout ? "recipe-card__cols--stacked" : ""}`}
        style={shrinkStyle}
      >
        {hasIngredientsSection && (
          <section
            className={`recipe-card__ingredients ${ingredientsWide ? "recipe-card__ingredients--wide" : ""}`}
            ref={ingredientsWide ? ingredientColumns.sectionRef : undefined}
          >
            <h2 className="recipe-card__label">Ingredients</h2>
            {ingredientGroups.length === 0 ? (
              showEmptyIngredients && (
                <div className="recipe-card__section-groups">
                  <div className="recipe-card__section-group">
                    <ul>
                      <li className="recipe-card__editable-line">{addLine("ingredient", 0, "empty")}</li>
                    </ul>
                  </div>
                </div>
              )
            ) : ingredientsWide ? (
              <>
                <div
                  aria-hidden
                  className="recipe-card__section-groups recipe-card__section-groups--probe"
                  ref={ingredientColumns.probeRef}
                >
                  {ingredientChunks.map((chunk, i) => (
                    <div key={i} ref={ingredientColumns.itemRef(i)}>
                      {chunk.groupTitle !== undefined && (
                        <h3 className="recipe-card__section-title">{chunk.groupTitle}</h3>
                      )}
                      <ul>{renderIngredientProbeItem(chunk.item)}</ul>
                    </div>
                  ))}
                </div>
                {ingredientColumns.splitIndex === null ? (
                  <div className="recipe-card__section-groups">
                    {renderChunkGroups(ingredientChunks, renderIngredientItem, "ingredientSection", "ul")}
                  </div>
                ) : (
                  <div className="recipe-card__section-groups recipe-card__section-groups--columns">
                    <div className="recipe-card__section-groups-column">
                      {renderChunkGroups(
                        ingredientChunks.slice(0, ingredientColumns.splitIndex),
                        renderIngredientItem,
                        "ingredientSection",
                        "ul",
                      )}
                    </div>
                    <div className="recipe-card__section-groups-column">
                      {renderChunkGroups(
                        ingredientChunks.slice(ingredientColumns.splitIndex),
                        renderIngredientItem,
                        "ingredientSection",
                        "ul",
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="recipe-card__section-groups">
                {ingredientGroups.map((group, groupIndex) => (
                  <div
                    className="recipe-card__section-group"
                    key={`${group.title ?? "ingredients"}-${groupIndex}`}
                  >
                    {group.title &&
                      sectionTitle("ingredientSection", recipe.ingredients.indexOf(group.items[0]), group.title)}
                    <ul>{group.items.map((ing) => renderIngredientItem(ing, recipe.ingredients.indexOf(ing)))}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {hasInstructionsSection && (
          <section
            className={`recipe-card__method ${methodWide ? "recipe-card__method--wide" : ""}`}
            ref={methodWide ? methodColumns.sectionRef : undefined}
          >
            <h2 className="recipe-card__label">
              Steps
              {side === "front" && hasBackFace && !continued ? (
                // A cookbook continues on the NEXT LEAF, never on the back of
                // this one (see `continueOnBack` in lib/usePrintSheets.tsx —
                // duplex is the recipe-card path only), so "on back" sent the
                // cook looking at the wrong side of the page.
                <span className="recipe-card__continued-inline">
                  {cookbookMode ? " (continued on the next page)" : " (continued on back)"}
                </span>
              ) : side === "back" || continued ? (
                " continued"
              ) : (
                ""
              )}
            </h2>
            {instructionGroups.length === 0 ? (
              showEmptyInstructions && (
                <div className="recipe-card__section-groups">
                  <div className="recipe-card__section-group">
                    <ol>
                      <li className="recipe-card__editable-line">{addLine("step", 0, "empty")}</li>
                    </ol>
                  </div>
                </div>
              )
            ) : methodWide ? (
              <>
                <div
                  aria-hidden
                  className="recipe-card__section-groups recipe-card__section-groups--probe"
                  ref={methodColumns.probeRef}
                >
                  {instructionChunks.map((chunk, i) => (
                    <div key={i} ref={methodColumns.itemRef(i)}>
                      {chunk.groupTitle !== undefined && (
                        <h3 className="recipe-card__section-title">{chunk.groupTitle}</h3>
                      )}
                      <ol>{renderInstructionProbeItem(chunk.item)}</ol>
                    </div>
                  ))}
                </div>
                {methodColumns.splitIndex === null ? (
                  <div className="recipe-card__section-groups">
                    {renderChunkGroups(instructionChunks, renderInstructionItem, "instructionSection", "ol")}
                  </div>
                ) : (
                  <div className="recipe-card__section-groups recipe-card__section-groups--columns">
                    <div className="recipe-card__section-groups-column">
                      {renderChunkGroups(
                        instructionChunks.slice(0, methodColumns.splitIndex),
                        renderInstructionItem,
                        "instructionSection",
                        "ol",
                      )}
                    </div>
                    <div className="recipe-card__section-groups-column">
                      {renderChunkGroups(
                        instructionChunks.slice(methodColumns.splitIndex),
                        renderInstructionItem,
                        "instructionSection",
                        "ol",
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="recipe-card__section-groups">
                {instructionGroups.map((group, groupIndex) => (
                  <div className="recipe-card__section-group" key={`${group.title ?? "steps"}-${groupIndex}`}>
                    {group.title &&
                      sectionTitle("instructionSection", recipe.instructions.indexOf(group.items[0]), group.title)}
                    <ol>
                      {group.items.map((step) =>
                        renderInstructionItem(step, recipe.instructions.indexOf(step)),
                      )}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* No footer in cookbook mode: the "Printed with RecipePrinter" brand is
          dropped for a bound book (even on free templates), and the source link
          has moved up under the meta line above. */}
      {!cookbookMode && (
        <footer className="recipe-card__footer">
          <span className="recipe-card__footer-brand">Printed with RecipePrinter</span>
          {showSourceUrl && showHeader && (
            canEdit && inlineEdit ? (
              <input
                className="recipe-card__inline-input recipe-card__footer-source"
                value={
                  sameTarget(inlineEdit.editingTarget, { kind: "sourceUrl" })
                    ? inlineEdit.value
                    : recipe.sourceUrl ?? ""
                }
                placeholder="Add link"
                aria-label="Source link"
                onFocus={() => startEdit({ kind: "sourceUrl" }, recipe.sourceUrl ?? "")}
                onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              source && <span className="recipe-card__footer-source">{source}</span>
            )
          )}
        </footer>
      )}
    </article>
  );
});

export interface DividerCardInlineEdit {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  /** Chapter-opener intro line + photo, edited alongside the title. */
  subtitle?: string;
  onSubtitleChange?: (value: string) => void;
  intro?: string;
  onIntroChange?: (value: string) => void;
  photoUrl?: string;
  recipeImages?: string[];
  onPhotoChange?: (url: string | undefined) => void;
  /** Unified placement (None/In-card/Full-page/Photo grid) + grid curation, so
      the opener picker is the same dialog as a recipe's, plus the cover's grid. */
  placement?: string;
  placementOptions?: Array<{ id: string; label: string; hint?: string }>;
  onPlacementChange?: (id: string) => void;
  gridActive?: boolean;
  gridImages?: string[];
  onGridChange?: (urls: string[]) => void;
  onSelectGrid?: () => void;
  onExitGrid?: () => void;
  gridMax?: number;
}

// A section divider is always exactly one physical page — no ingredients/
// instructions budget to split — so unlike RecipeCardFace's title/ingredient/
// step fields there's just the one editable field. Same technique as the
// recipe title, though: the wrapping field shares its typography class with the
// `<h1>` it replaces (plus the shared `.recipe-card__inline-input` reset, see
// its comment in globals.css) so the box is pixel-identical — editing swaps
// the element, not the layout.
// Spelled-out chapter ordinal for the opener eyebrow ("Chapter Two"), falling
// back to the numeral past what's spelled so it never reads "Chapter undefined".
const CHAPTER_WORDS = [
  "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve",
];
function chapterWord(n: number): string {
  return CHAPTER_WORDS[n - 1] ?? String(n);
}

// Default chapter-opener copy so a section page reads as designed rather than a
// lone title. Shown only in read-only/print; the editor still binds to the
// section's own (empty) intro with its placeholder, so a cook can personalize
// each opener or leave the default to print. Kept generic on purpose — it's
// filler the cook is expected to make their own.
export const DEFAULT_CHAPTER_INTRO =
  "A handful of recipes worth making again and again.";

export const DividerFace = memo(function DividerFace({
  title,
  chapterNumber = 1,
  showChapterNumber = false,
  subtitle,
  photoUrl,
  intro,
  previewHidden = false,
  inlineEdit,
  template,
  showDecoration = true,
}: {
  title: string;
  chapterNumber?: number;
  showChapterNumber?: boolean;
  subtitle?: string;
  photoUrl?: string;
  intro?: string;
  /** Kept for back-compat / TOC callers; the opener itself no longer lists them. */
  recipeTitles?: string[];
  previewHidden?: boolean;
  inlineEdit?: DividerCardInlineEdit;
  template?: RecipePrintTemplate;
  /** See `TemplateDecoration` — false on surfaces that never show it. */
  showDecoration?: boolean;
}) {
  return (
    <article
      className={`recipe-card recipe-card--divider recipe-card--chapter${photoUrl ? " recipe-card--chapter-with-photo" : ""}`}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__chapter-photo" aria-hidden>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="recipe-card__chapter-image" onLoad={(event) => markImageAvailable(event.currentTarget)} onError={(event) => markImageUnavailable(event.currentTarget)} />
        )}
        <span className="photo-unavailable-message">Photo unavailable</span>
      </div>
      {inlineEdit?.onPhotoChange && (
        <ImagePicker
          current={photoUrl}
          images={inlineEdit.recipeImages ?? []}
          onSelect={inlineEdit.onPhotoChange}
          placement={inlineEdit.placement}
          placementOptions={inlineEdit.placementOptions}
          onPlacementChange={inlineEdit.onPlacementChange}
          gridActive={inlineEdit.gridActive}
          gridImages={inlineEdit.gridImages}
          onGridChange={inlineEdit.onGridChange}
          onSelectGrid={inlineEdit.onSelectGrid}
          onExitGrid={inlineEdit.onExitGrid}
          gridMax={inlineEdit.gridMax}
          label="Photo"
          className="recipe-card__cook-photo-edit"
        />
      )}
      <div className="recipe-card__chapter-frame" aria-hidden />
      <TemplateDecoration template={template} show={showDecoration} />
      <div className="recipe-card__chapter-body">
        <span className="recipe-card__chapter-ornament" aria-hidden />
        {showChapterNumber && (
          <p className="recipe-card__chapter-eyebrow">Chapter {chapterWord(chapterNumber)}</p>
        )}
        {inlineEdit ? (
          <textarea
            autoFocus
            rows={1}
            className="recipe-card__inline-textarea recipe-card__divider-title"
            value={inlineEdit.value}
            aria-label="Chapter title"
            // No commit-on-blur: the title saves live via onChange, so blurring
            // to click the photo picker or the subtitle/intro fields must NOT end
            // the edit. Enter finishes it; Escape closes it.
            onChange={(event) => inlineEdit.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                inlineEdit.onCommit();
              }
              if (event.key === "Escape") inlineEdit.onCancel();
            }}
          />
        ) : (
          <h1 className="recipe-card__divider-title">{title}</h1>
        )}
        {inlineEdit?.onSubtitleChange ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__chapter-subtitle"
            value={inlineEdit.subtitle ?? ""}
            placeholder="Section subtitle (optional)"
            aria-label="Section subtitle"
            onChange={(event) => inlineEdit.onSubtitleChange?.(event.target.value)}
          />
        ) : (
          subtitle && <p className="recipe-card__chapter-subtitle">{subtitle}</p>
        )}
        {inlineEdit?.onIntroChange ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__chapter-intro"
            value={inlineEdit.intro ?? ""}
            placeholder="A short chapter intro…"
            aria-label="Chapter intro"
            onChange={(event) => inlineEdit.onIntroChange?.(event.target.value)}
          />
        ) : (
          <p className="recipe-card__chapter-intro">{intro || DEFAULT_CHAPTER_INTRO}</p>
        )}
      </div>
    </article>
  );
});

export interface CoverCardInlineEdit {
  cover: CoverConfig;
  onChange: (cover: CoverConfig) => void;
  /** Candidate cover photos (the book's recipe images) offered in edit mode. */
  recipeImages?: string[];
}

/**
 * The spine panel of a hardcover case wrap.
 *
 * A hardcover's cover is one flat sheet — back | spine | front — so the spine
 * is a real printed surface, not decoration. It was missing entirely: the
 * export emitted the front cover as a lone trim-size page, which is not a file
 * any case binder can use.
 *
 * It matches the theme by construction rather than by a parallel set of rules:
 * the paper element and `TemplateDecoration` are the SAME ones the front and
 * back covers use, so a spine can never drift from the covers it sits between
 * when a template changes. Only the geometry is spine-specific, and that comes
 * from `lib/coverWrap.ts`.
 *
 * Type runs bottom-to-top, the convention for English-language hardcovers, so
 * the title reads correctly when the book lies face-up on a table.
 *
 * A thin book gets a blank spine: below `MIN_TITLED_SPINE_IN` there is no room
 * for legible type between the hinges, and printers reject or silently mangle
 * type that crowds them. Blank is the correct output there, not smaller text.
 */
export const SpineFace = memo(function SpineFace({
  cover,
  template,
  spineWidthIn,
  showTitle,
  showDecoration = true,
}: {
  cover: CoverConfig;
  /** Authoritative over the template captured in an older cover draft, exactly
      as `CoverFace` treats it. */
  template?: RecipePrintTemplate;
  /** Physical spine width in inches, from `coverWrapGeometry`. */
  spineWidthIn: number;
  /** False when the spine is too thin to carry type — see `spineFitsTitle`. */
  showTitle: boolean;
  showDecoration?: boolean;
}) {
  const resolved = template ?? cover.template;
  return (
    <div
      className="recipe-card recipe-card--cover recipe-card--spine"
      style={{ ["--rp-spine-w" as string]: `${spineWidthIn}in` }}
      aria-hidden
    >
      <div className="recipe-card__cover-photo recipe-card__cover-photo--paper" aria-hidden />
      {/* Bistro's decoration is itself a spine-like strip down the page edge —
          on a panel this narrow it would read as a stripe of noise rather than
          a motif, so it sits out here exactly as it does on the back cover. */}
      <TemplateDecoration template={resolved} show={showDecoration && resolved !== "bistro"} />
      {showTitle && (
        <div className="recipe-card__spine-text">
          <span className="recipe-card__spine-title">{cover.title}</span>
          {cover.author && <span className="recipe-card__spine-author">{cover.author}</span>}
        </div>
      )}
    </div>
  );
});

export const CoverFace = memo(function CoverFace({
  cover,
  side,
  template,
  previewHidden = false,
  inlineEdit,
  showDecoration = true,
}: {
  cover: CoverConfig;
  side: "front" | "back" | "dedication";
  /** The active preview template. This is authoritative over the template
      captured in an older cover draft so decoration cannot persist across a
      theme change. */
  template?: RecipePrintTemplate;
  previewHidden?: boolean;
  /** See `TemplateDecoration` — false on surfaces that never show it. */
  showDecoration?: boolean;
  inlineEdit?: CoverCardInlineEdit;
}) {
  const canEdit = Boolean(inlineEdit);
  const draft = inlineEdit?.cover ?? cover;

  function set(patch: Partial<CoverConfig>) {
    inlineEdit?.onChange({ ...draft, ...patch });
  }

  // Dedication: a quiet front-matter page on the template's own paper — a short,
  // centered dedication line, no photo. Shares the back cover's paper treatment.
  if (side === "dedication") {
    return (
      <article
        className="recipe-card recipe-card--cover recipe-card--cover-back recipe-card--cover-dedication"
        data-preview-hidden={previewHidden ? "true" : undefined}
      >
        <div className="recipe-card__cover-photo recipe-card__cover-photo--paper" aria-hidden />
        <TemplateDecoration
          template={template ?? draft.template}
          show={showDecoration && (template ?? draft.template) !== "bistro"}
        />
        <div className="recipe-card__cover-band" aria-hidden />
        <div className="recipe-card__cover-back-content">
          {canEdit ? (
            <textarea
              rows={1}
              className="recipe-card__inline-textarea recipe-card__cover-dedication-label"
              value={draft.title}
              placeholder="Opening page heading"
              aria-label="Opening page heading"
              onChange={(event) => set({ title: event.target.value })}
            />
          ) : (
            <p className="recipe-card__cover-dedication-label">{draft.title || "Dedication"}</p>
          )}
          {canEdit ? (
            <textarea
              className="recipe-card__inline-textarea recipe-card__cover-blurb recipe-card__cover-dedication-text"
              value={draft.blurb ?? ""}
              placeholder="For the ones who taught us to cook, and who made every table feel like home."
              aria-label="Dedication"
              onChange={(event) => set({ blurb: event.target.value || undefined })}
            />
          ) : (
            draft.blurb && (
              <p className="recipe-card__cover-blurb recipe-card__cover-dedication-text">{draft.blurb}</p>
            )
          )}
          {canEdit ? (
            <textarea
              rows={1}
              className="recipe-card__inline-textarea recipe-card__cover-from recipe-card__cover-dedication-sign"
              value={draft.author ?? ""}
              placeholder="— The Smith Family (optional)"
              aria-label="Dedication signature"
              onChange={(event) => set({ author: event.target.value || undefined })}
            />
          ) : (
            draft.author && (
              <p className="recipe-card__cover-from recipe-card__cover-dedication-sign">{draft.author}</p>
            )
          )}
        </div>
      </article>
    );
  }

  // Back cover: a quiet closing page on the template's own paper — a short
  // blurb and a "from the kitchen of" line, centered. No photo/scrim.
  if (side === "back") {
    return (
      <article
        className="recipe-card recipe-card--cover recipe-card--cover-back"
        data-preview-hidden={previewHidden ? "true" : undefined}
      >
        <div className="recipe-card__cover-photo recipe-card__cover-photo--paper" aria-hidden />
        <TemplateDecoration
          template={template ?? draft.template}
          show={showDecoration && (template ?? draft.template) !== "bistro"}
        />
        <div className="recipe-card__cover-band" aria-hidden />
        <div className="recipe-card__cover-back-content">
          {canEdit ? (
            <textarea
              className="recipe-card__inline-textarea recipe-card__cover-blurb"
              value={draft.blurb ?? ""}
              placeholder="A closing line…"
              aria-label="Back cover blurb"
              onChange={(event) => set({ blurb: event.target.value || undefined })}
            />
          ) : (
            draft.blurb && <p className="recipe-card__cover-blurb">{draft.blurb}</p>
          )}
          {canEdit ? (
            <textarea
              rows={1}
              className="recipe-card__inline-textarea recipe-card__cover-from"
              value={draft.author ?? ""}
              placeholder="From the kitchen of…"
              aria-label="Back cover credit"
              onChange={(event) => set({ author: event.target.value || undefined })}
            />
          ) : (
            draft.author && <p className="recipe-card__cover-from">{draft.author}</p>
          )}
        </div>
      </article>
    );
  }

  // Front cover: a photo collage (default), a single photo, or — when there are
  // no photos — a photo-free typographic cover on the template's paper. Never a
  // placeholder fill. `coverMode` drives the styling (scrim + white lockup over
  // photos; template-colored lockup on paper when there's no photo).
  const gridImages = (draft.gridImages ?? []).filter(Boolean);
  const requestedLayout = draft.layout ??
    (gridImages.length > 0 ? "collage" : draft.imageUrl ? "photo" : "typographic");
  const coverMode =
    requestedLayout === "collage" && gridImages.length > 0
      ? "grid"
      : requestedLayout === "photo" && draft.imageUrl
        ? "photo"
        : "none";
  // Responsive collage: columns + banner adapt to the photo count so any number
  // (2, 3, 5, …) fills the frame with no empty cells. Shared with section grids.
  const { columns: gridColumns, firstSpans: gridFirstSpans } = photoGridLayout(gridImages.length);
  const candidateImages = inlineEdit?.recipeImages ?? [];

  return (
    <article
      className="recipe-card recipe-card--cover recipe-card--cover-front"
      data-cover-mode={coverMode}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div
        className={`recipe-card__cover-photo ${coverMode === "grid" ? "recipe-card__cover-photo--grid" : ""}`}
        style={coverMode === "grid" ? ({ "--cover-grid-cols": gridColumns } as CSSProperties) : undefined}
        aria-hidden
      >
        {coverMode === "grid" &&
          gridImages.slice(0, 6).map((image, index) => (
            <span
              key={`${image}-${index}`}
              className={`recipe-card__cover-grid-cell ${
                gridFirstSpans && index === 0 ? "recipe-card__cover-grid-img--wide" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="recipe-card__cover-grid-img" onLoad={(event) => markImageAvailable(event.currentTarget)} onError={(event) => markImageUnavailable(event.currentTarget)} />
              <span className="photo-unavailable-message">Photo unavailable</span>
            </span>
          ))}
        {coverMode === "photo" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.imageUrl} alt="" className="recipe-card__cover-image" onLoad={(event) => markImageAvailable(event.currentTarget)} onError={(event) => markImageUnavailable(event.currentTarget)} />
        )}
        {coverMode === "photo" && <span className="photo-unavailable-message">Photo unavailable</span>}
      </div>
      <div className="recipe-card__cover-scrim" aria-hidden />
      <div className="recipe-card__cover-band" aria-hidden />
      {canEdit && (
        <ImagePicker
          current={draft.imageUrl}
          gridActive={coverMode === "grid"}
          images={candidateImages}
          className="recipe-card__cover-photopicker"
          onSelect={(imageUrl) =>
            set({
              imageUrl,
              gridImages: undefined,
              layout: imageUrl ? "photo" : "typographic",
            })
          }
          gridImages={gridImages}
          onGridChange={(urls) =>
            set({
              gridImages: urls.length ? urls : undefined,
              imageUrl: undefined,
              layout: urls.length ? "collage" : "typographic",
            })
          }
          onSelectGrid={
            candidateImages.length >= 2
              ? () => {
                  // Seed the collage with a sensible starting set; the user then
                  // curates exactly how many and which ones in the picker.
                  const count =
                    candidateImages.length >= 6 ? 6 : candidateImages.length >= 4 ? 4 : 2;
                  set({
                    gridImages: candidateImages.slice(0, count),
                    imageUrl: undefined,
                    layout: "collage",
                  });
                }
              : undefined
          }
        />
      )}
      {/* Decorative hooks the per-theme CSS turns on (frames/ornaments for
          Heirloom, Keepsake, etc.); hidden by default on photo-forward themes. */}
      <div className="recipe-card__cover-frame" aria-hidden />
      <TemplateDecoration
        template={template ?? draft.template}
        show={showDecoration && (template ?? draft.template) !== "bistro"}
      />
      <div className="recipe-card__cover-content">
        <span className="recipe-card__cover-ornament" aria-hidden />
        {canEdit ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__cover-subtitle"
            value={draft.subtitle ?? ""}
            placeholder="A family cookbook"
            aria-label="Cover kicker"
            onChange={(event) => set({ subtitle: event.target.value || undefined })}
          />
        ) : (
          draft.subtitle && <p className="recipe-card__cover-subtitle">{draft.subtitle}</p>
        )}
        {canEdit ? (
          <textarea
            autoFocus
            rows={1}
            className="recipe-card__inline-textarea recipe-card__cover-title"
            value={draft.title}
            placeholder="Cover title"
            aria-label="Cover title"
            onChange={(event) => set({ title: event.target.value })}
          />
        ) : (
          draft.title && <h1 className="recipe-card__cover-title">{draft.title}</h1>
        )}
        <div className="recipe-card__cover-rule" aria-hidden />
        {canEdit ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__cover-author"
            value={draft.author ?? ""}
            placeholder="Compiled by the Smith family"
            aria-label="Cover byline"
            onChange={(event) => set({ author: event.target.value || undefined })}
          />
        ) : (
          // Whatever they typed, verbatim — no forced "Compiled by" prefix.
          draft.author && <p className="recipe-card__cover-author">{draft.author}</p>
        )}
        {canEdit ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__cover-edition"
            value={draft.edition ?? ""}
            placeholder="Edition or year (optional)"
            aria-label="Cover edition or year"
            onChange={(event) => set({ edition: event.target.value || undefined })}
          />
        ) : (
          draft.edition && <p className="recipe-card__cover-edition">{draft.edition}</p>
        )}
      </div>
    </article>
  );
});

export interface TableOfContentsEntry {
  kind: "chapter" | "recipe";
  title: string;
  pageNumber?: number;
  chapterNumber?: number;
  /** This chapter heading is a repeat at the top of a contents page whose
      recipes carried over from the page before. */
  continued?: boolean;
}

export interface TableOfContentsInlineEdit {
  kicker: string;
  title: string;
  onKickerChange: (value: string) => void;
  onTitleChange: (value: string) => void;
}

// The contents page: chapters as headings, recipes indented beneath with dot
// leaders and the printed page they land on. The heading is editable; the
// entries themselves are generated from the sheet order in usePrintSheets and
// are never hand-maintained (a note in edit mode says so).
export const TableOfContentsFace = memo(function TableOfContentsFace({
  entries,
  kicker,
  title,
  continued = false,
  template,
  previewHidden = false,
  showDecoration = true,
  inlineEdit,
}: {
  entries: TableOfContentsEntry[];
  kicker?: string;
  title?: string;
  /** A contents page after the first. It repeats neither the heading nor the
      editing affordances — it is the same list, still running. */
  continued?: boolean;
  template?: RecipePrintTemplate;
  previewHidden?: boolean;
  showDecoration?: boolean;
  inlineEdit?: TableOfContentsInlineEdit;
}) {
  const kickerText = (inlineEdit ? inlineEdit.kicker : kicker) || "Contents";
  const titleText = (inlineEdit ? inlineEdit.title : title) || "What's inside";
  // The heading is set once, on the first page; a continuation just says so
  // quietly and gives the rest of the page to the list.
  const heading = continued ? (
    <p className="recipe-card__toc-kicker recipe-card__toc-kicker--continued">
      {kickerText} continued
    </p>
  ) : null;
  return (
    <article
      className="recipe-card recipe-card--toc"
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <TemplateDecoration template={template} show={showDecoration} />
      <div className="recipe-card__toc-content">
        {heading}
        {continued ? null : inlineEdit ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__toc-kicker"
            value={inlineEdit.kicker}
            placeholder="Contents"
            aria-label="Contents label"
            onChange={(event) => inlineEdit.onKickerChange(event.target.value)}
          />
        ) : (
          <p className="recipe-card__toc-kicker">{kickerText}</p>
        )}
        {continued ? null : inlineEdit ? (
          <textarea
            rows={1}
            className="recipe-card__inline-textarea recipe-card__toc-title"
            value={inlineEdit.title}
            placeholder="What's inside"
            aria-label="Contents heading"
            onChange={(event) => inlineEdit.onTitleChange(event.target.value)}
          />
        ) : (
          <h1 className="recipe-card__toc-title">{titleText}</h1>
        )}
        <ol className="recipe-card__toc-list">
          {entries.map((entry, index) =>
            entry.kind === "chapter" ? (
              <li
                key={`c-${index}`}
                className={`recipe-card__toc-chapter${
                  entry.continued ? " recipe-card__toc-chapter--continued" : ""
                }`}
              >
                <span className="recipe-card__toc-chapter-name">
                  {entry.title}
                  {entry.continued && (
                    <span className="recipe-card__toc-chapter-continued"> (continued)</span>
                  )}
                </span>
                {entry.pageNumber !== undefined && (
                  <span className="recipe-card__toc-pg">{entry.pageNumber}</span>
                )}
              </li>
            ) : (
              <li key={`r-${index}`} className="recipe-card__toc-recipe">
                <span className="recipe-card__toc-recipe-name">{entry.title}</span>
                <span className="recipe-card__toc-leader" aria-hidden />
                {entry.pageNumber !== undefined && (
                  <span className="recipe-card__toc-pg">{entry.pageNumber}</span>
                )}
              </li>
            ),
          )}
        </ol>
        {inlineEdit && !continued && (
          <p className="recipe-card__toc-note no-print">
            Chapters, recipes and page numbers are pulled from your pages — to change them,
            edit a section or recipe.
          </p>
        )}
      </div>
    </article>
  );
});
