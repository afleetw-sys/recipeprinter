import type { RecipeFace } from "@/lib/recipeCardLayout";

// Shared DOM-measurement primitives for the print card faces. Extracted from
// RecipeFaceMeasurer so the correction loop AND the measurement harness
// (app/print/_harness) read overflow the exact same way — the harness's
// "does this face clip?" verdict is only trustworthy if it measures overflow
// with the identical geometry the live corrector uses.

export const OVERFLOW_TOLERANCE_PX = 1;

export const INGREDIENT_ITEM_SELECTOR = ".recipe-card__ingredients li";
export const INSTRUCTION_ITEM_SELECTOR = ".recipe-card__method li";

export function blankStackedFace(): RecipeFace {
  return { ingredients: [], instructions: [], layout: "stacked" };
}

export function isEmptyFace(face: RecipeFace): boolean {
  return face.ingredients.length === 0 && face.instructions.length === 0;
}

// Positive = overflowing by this many px, negative = this much real slack.
// Deliberately *not* `cardEl.scrollHeight` vs `minHeight`: the footer is
// `position: absolute; bottom: ...`, anchored near the card's bottom
// regardless of how much content sits above it, so the whole card's
// scrollHeight always reads close to minHeight whether or not the content
// actually fills that space — real for detecting overflow (content that
// pushes past the footer's position genuinely extends scrollHeight further),
// structurally blind to slack (an under-filled face still measures "full"
// because the footer is still sitting right where it always sits).
//
// `.cols` itself is *also* a `flex: 1` child of the card (see globals.css),
// so it has exactly the same problem: it always stretches to fill the space
// between the header and the card's bottom edge regardless of how much (or
// how little) is actually inside it, and `scrollHeight` reports that
// stretched box, not the content. A face with little or no content — most
// visibly one with zero ingredients/instructions, which a previous reflow
// pass can genuinely produce — then measures as "full" (and can even read as
// mildly *overflowing*, since the flex-allocated box runs a few px past the
// footer's actual position) even though there's nothing rendered in it at
// all, which used to send the reflow loop into a spiral: it would try to
// relieve that phantom overflow, find nothing left to pop, and land the
// whole recipe permanently stranded off the first page. Measuring the real
// bottom edge of `.cols`' own children instead — 0 when it has none — reads
// the actual content honestly regardless of how the flex box around it is
// sized.
// The real content leaves whose bottom edge represents actual ink on the
// face: section labels ("Ingredients"/"Steps"), group subtitles, and the
// ingredient/step lines themselves. Deliberately NOT `.cols`' direct children
// (the `<section>`/column wrappers): those are flex boxes that stretch to fill
// the card, so an under-filled face's wrapper still reaches near the card
// bottom even though its few lines of text sit up top — measuring the wrapper
// reported phantom overflow (≈ the footer's height) on nearly-empty faces.
// Measuring the leaves reads the true content bottom regardless of how the
// flex boxes around them are sized.
const CONTENT_LEAF_SELECTOR =
  ".recipe-card__ingredients li, .recipe-card__method li, .recipe-card__label, .recipe-card__section-title";

// `useWideColumns` measures its chunks by rendering a hidden copy of every
// item into `.recipe-card__section-groups--probe` (absolutely positioned at
// `left: -9999px`). That copy still has real geometry and its `li`s match the
// selectors above, so any measurement that doesn't exclude it is reading the
// probe instead of the printed content — and the probe is a single tall stack
// of every chunk, so it is both taller than a settled two-column section and
// ordered *before* the real items in the DOM. That corrupted overflow
// readings and, because `takeLeadingItems` indexes from the front, meant the
// pull was sizing items from probe geometry rather than where they'd land.
const PROBE_CONTAINER_SELECTOR = ".recipe-card__section-groups--probe";

function isProbeContent(el: Element): boolean {
  return el.closest(PROBE_CONTAINER_SELECTOR) !== null;
}

function realContentElements(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => !isProbeContent(el));
}

export function colsOverflowPx(cardEl: HTMLElement): number {
  const cols = cardEl.querySelector<HTMLElement>(".recipe-card__cols");
  const footer = cardEl.querySelector<HTMLElement>(".recipe-card__footer");
  if (!cols) return 0;
  const colsTop = cols.getBoundingClientRect().top;
  let contentBottom = colsTop;
  for (const leaf of realContentElements(cols, CONTENT_LEAF_SELECTOR)) {
    contentBottom = Math.max(contentBottom, leaf.getBoundingClientRect().bottom);
  }
  // Several templates (and every 6x4 card, regardless of template) hide the
  // footer entirely via `display: none` when it has no source link to show
  // — it still matches the selector, but its rect collapses to 0/0/0/0,
  // which isn't a real "the footer starts at the top of the viewport"
  // position. Falling back to the card's own padded bottom edge in that case
  // (same as when the selector matches nothing at all) is what the footer's
  // position would've reserved anyway, had it been rendered.
  const footerRect = footer?.getBoundingClientRect();
  const footerTop =
    footerRect && (footerRect.width > 0 || footerRect.height > 0)
      ? footerRect.top
      : cardEl.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(cardEl).paddingBottom) || 0);
  return contentBottom - footerTop;
}

// Real, printed items only — never the hidden column-measurement probe (see
// `PROBE_CONTAINER_SELECTOR`). The order matters as much as the values: these
// heights are indexed from the front by the pull and from the back by the pop,
// so including the probe's copies both doubled the list and put non-printing
// geometry at index 0.
export function realItemHeights(cardEl: HTMLElement, selector: string): number[] {
  return realContentElements(cardEl, selector).map((el) => el.getBoundingClientRect().height);
}

export interface FaceMeasureDetail {
  /** Positive = overflowing by this many px (same value as colsOverflowPx). */
  overflowPx: number;
  /** The vertical space the `.cols` content is allowed to occupy on this face. */
  availableHeightPx: number;
  /** Tallest single ingredient/instruction line on the face. */
  tallestItemPx: number;
  /** Height of this face's FIRST content line — what it would cost the
      previous face to pull it up. Drives the avoidable-underfill check. */
  firstItemPx: number;
  /** True when this face's first line is a step rather than an ingredient. */
  firstItemIsInstruction: boolean;
  /** Height (incl. margins) of the section label that first line sits under —
      the extra cost a face pays to receive it if it has no such section yet. */
  firstItemLabelPx: number;
  hasIngredients: boolean;
  hasInstructions: boolean;
}

function labelHeightPx(cardEl: HTMLElement, sectionSelector: string): number {
  const label = cardEl.querySelector<HTMLElement>(`${sectionSelector} .recipe-card__label`);
  if (!label) return 0;
  const style = getComputedStyle(label);
  return (
    label.getBoundingClientRect().height +
    (parseFloat(style.marginTop) || 0) +
    (parseFloat(style.marginBottom) || 0)
  );
}

// Richer measurement used by the harness's failure categorization: alongside
// the overflow, it reports how much room the face's content had and the height
// of its single tallest line. A face that overflows where the tallest line
// alone already exceeds the available height is an *unbreakable-oversized*
// item (no split can rescue it — it needs smaller type), which is a different
// problem from a *repackable* overflow that a better packer can fix.
export function faceMeasureDetail(cardEl: HTMLElement): FaceMeasureDetail {
  const overflowPx = colsOverflowPx(cardEl);
  const cols = cardEl.querySelector<HTMLElement>(".recipe-card__cols");
  const footer = cardEl.querySelector<HTMLElement>(".recipe-card__footer");
  let availableHeightPx = 0;
  if (cols) {
    const colsTop = cols.getBoundingClientRect().top;
    const footerRect = footer?.getBoundingClientRect();
    const footerTop =
      footerRect && (footerRect.width > 0 || footerRect.height > 0)
        ? footerRect.top
        : cardEl.getBoundingClientRect().bottom -
          (parseFloat(getComputedStyle(cardEl).paddingBottom) || 0);
    availableHeightPx = footerTop - colsTop;
  }
  const ingredientHeights = realItemHeights(cardEl, INGREDIENT_ITEM_SELECTOR);
  const instructionHeights = realItemHeights(cardEl, INSTRUCTION_ITEM_SELECTOR);
  const itemHeights = [...ingredientHeights, ...instructionHeights];
  const tallestItemPx = itemHeights.reduce((max, h) => Math.max(max, h), 0);
  // Ingredients always precede instructions in the flow, so the face's first
  // line is its first ingredient when it has any, else its first step.
  const firstItemPx = ingredientHeights[0] ?? instructionHeights[0] ?? 0;
  const firstItemIsInstruction = ingredientHeights.length === 0 && instructionHeights.length > 0;
  const firstItemLabelPx = labelHeightPx(
    cardEl,
    firstItemIsInstruction ? ".recipe-card__method" : ".recipe-card__ingredients",
  );
  return {
    overflowPx,
    availableHeightPx,
    tallestItemPx,
    firstItemPx,
    firstItemIsInstruction,
    firstItemLabelPx,
    hasIngredients: ingredientHeights.length > 0,
    hasInstructions: instructionHeights.length > 0,
  };
}

// ── Pure, DOM-free invariant checks on a settled page list ─────────────────
// These need no browser — a plain array of faces is enough — so both the
// harness and any future unit test can assert them directly.

export interface FaceInvariantResult {
  /** INV-2: every source item appears exactly once, in original order. */
  complete: boolean;
  /** INV-3: no non-first face is empty. */
  noEmptyFace: boolean;
  /** INV-4: within the flow, all ingredients precede all instructions. */
  ingredientsBeforeInstructions: boolean;
}

// Compares the flattened item indices the faces actually carry against the
// full recipe's item count. `indexOf` maps a placed item back to its position
// in the original array; a correct split visits 0..n-1 exactly once in order.
export function checkPageInvariants(
  pages: RecipeFace[],
  ingredientCount: number,
  instructionCount: number,
  ingredientIndexOf: (item: RecipeFace["ingredients"][number]) => number,
  instructionIndexOf: (item: RecipeFace["instructions"][number]) => number,
): FaceInvariantResult {
  const ingredientIndices: number[] = [];
  const instructionIndices: number[] = [];
  for (const page of pages) {
    for (const ing of page.ingredients) ingredientIndices.push(ingredientIndexOf(ing));
    for (const step of page.instructions) instructionIndices.push(instructionIndexOf(step));
  }

  const isIdentitySequence = (indices: number[], count: number) =>
    indices.length === count && indices.every((value, i) => value === i);

  const complete =
    isIdentitySequence(ingredientIndices, ingredientCount) &&
    isIdentitySequence(instructionIndices, instructionCount);

  const noEmptyFace = pages.every((page, i) => i === 0 || !isEmptyFace(page));

  // Once any face carries an instruction, no later face may introduce a fresh
  // ingredient — the pop/pull logic (and the future packer) both rely on
  // ingredients fully preceding instructions in the placed flow.
  let seenInstruction = false;
  let ingredientsBeforeInstructions = true;
  for (const page of pages) {
    if (seenInstruction && page.ingredients.length > 0) {
      ingredientsBeforeInstructions = false;
      break;
    }
    if (page.instructions.length > 0) seenInstruction = true;
  }

  return { complete, noEmptyFace, ingredientsBeforeInstructions };
}
