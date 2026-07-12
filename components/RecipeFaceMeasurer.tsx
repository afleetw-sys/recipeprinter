"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  RecipeCardFace,
  getRecipeFaces,
  type PrintCardSize,
  type RecipeFace,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import type { Recipe } from "@/types/recipe";

// getRecipeFaces' character-count budget is a guess, not a measurement, so it
// can miss in both directions: a face can come out too full (prints
// truncated by the fixed card height's `overflow: hidden`) or too empty
// (content that would comfortably fit stays stranded on a later face
// instead — the original guess only ever assumed a face needed *less* than
// it turned out to). This component renders the guess off-screen at real
// size and corrects both directions: pops real trailing items off an
// overflowing face (walking each item's own real height back-to-front,
// rather than an averaged estimate), and pulls real leading items off the
// *next* face onto one with genuine slack — checked against that item's own
// real height (read straight off the next face's already-rendered DOM in the
// same pass), not assumed to fit. Settles once a pass makes no further
// change.

const MAX_REFLOW_PASSES = 60;
const OVERFLOW_TOLERANCE_PX = 1;

const INGREDIENT_ITEM_SELECTOR = ".recipe-card__ingredients li";
const INSTRUCTION_ITEM_SELECTOR = ".recipe-card__method li";

function blankStackedFace(): RecipeFace {
  return { ingredients: [], instructions: [], layout: "stacked" };
}

function isEmptyFace(face: RecipeFace): boolean {
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
function colsOverflowPx(cardEl: HTMLElement): number {
  const cols = cardEl.querySelector<HTMLElement>(".recipe-card__cols");
  const footer = cardEl.querySelector<HTMLElement>(".recipe-card__footer");
  if (!cols) return 0;
  const colsTop = cols.getBoundingClientRect().top;
  let contentBottom = colsTop;
  for (const child of Array.from(cols.children)) {
    contentBottom = Math.max(contentBottom, child.getBoundingClientRect().bottom);
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

function realItemHeights(cardEl: HTMLElement, selector: string): number[] {
  return Array.from(cardEl.querySelectorAll<HTMLElement>(selector)).map(
    (el) => el.getBoundingClientRect().height,
  );
}

interface PopResult {
  shrunk: RecipeFace;
  kind: "instructions" | "ingredients";
  items: Recipe["instructions"] | Recipe["ingredients"];
}

// Pops however many trailing items are actually needed to clear `overflowPx`,
// walking each item's real rendered height from the tail — a badly uneven
// mix (one long step among short ones) resolves in one step instead of
// needing repeated one-item-at-a-time correction passes.
function popTrailingItems(face: RecipeFace, overflowPx: number, cardEl: HTMLElement): PopResult | null {
  const useInstructions = face.instructions.length > 0;
  const useIngredients = !useInstructions && face.ingredients.length > 0;
  if (!useInstructions && !useIngredients) return null;

  const kind: "instructions" | "ingredients" = useInstructions ? "instructions" : "ingredients";
  const items = face[kind];
  const heights = realItemHeights(
    cardEl,
    kind === "instructions" ? INSTRUCTION_ITEM_SELECTOR : INGREDIENT_ITEM_SELECTOR,
  );

  let cleared = 0;
  let popCount = 0;
  for (let i = heights.length - 1; i >= 0 && cleared < overflowPx; i--) {
    cleared += heights[i] || 0;
    popCount += 1;
  }
  popCount = Math.min(items.length, Math.max(1, popCount));

  return {
    shrunk: { ...face, [kind]: items.slice(0, items.length - popCount) } as RecipeFace,
    kind,
    items: items.slice(items.length - popCount) as Recipe["instructions"] & Recipe["ingredients"],
  };
}

function prependItems(
  face: RecipeFace,
  kind: "instructions" | "ingredients",
  items: Recipe["instructions"] | Recipe["ingredients"],
): RecipeFace {
  if (kind === "instructions") {
    return { ...face, instructions: [...(items as Recipe["instructions"]), ...face.instructions] };
  }
  return { ...face, ingredients: [...(items as Recipe["ingredients"]), ...face.ingredients] };
}

// How many of `items` (front-to-back) fit within `slackPx`, using each
// item's own real height rather than an average.
function takeLeadingItems<T>(items: T[], slackPx: number, heights: number[]): T[] {
  const taken: T[] = [];
  let used = 0;
  for (let i = 0; i < items.length; i++) {
    const h = heights[i] || 0;
    if (used + h > slackPx) break;
    used += h;
    taken.push(items[i]);
  }
  return taken;
}

interface PullResult {
  grown: RecipeFace;
  shrunkNext: RecipeFace;
}

// The counterpart popTrailingItems never had: when a face has real slack and
// the next face still has content, pull that content's leading items back.
// Ingredients always finish before instructions start (continuationFaces'
// own construction, preserved here since pop/pull only ever move items
// between immediately-adjacent faces), so `nextFace.ingredients` being empty
// is exactly the signal that ingredients are done for the rest of the
// recipe and this face may start pulling instructions instead.
function pullLeadingItems(face: RecipeFace, nextFace: RecipeFace, slackPx: number, nextCardEl: HTMLElement): PullResult | null {
  if (face.instructions.length === 0 && nextFace.ingredients.length > 0) {
    const heights = realItemHeights(nextCardEl, INGREDIENT_ITEM_SELECTOR);
    const taken = takeLeadingItems(nextFace.ingredients, slackPx, heights);
    if (taken.length === 0) return null;
    return {
      grown: { ...face, ingredients: [...face.ingredients, ...taken] },
      shrunkNext: { ...nextFace, ingredients: nextFace.ingredients.slice(taken.length) },
    };
  }

  if (nextFace.instructions.length > 0 && (face.instructions.length > 0 || nextFace.ingredients.length === 0)) {
    const heights = realItemHeights(nextCardEl, INSTRUCTION_ITEM_SELECTOR);
    const taken = takeLeadingItems(nextFace.instructions, slackPx, heights);
    if (taken.length === 0) return null;
    return {
      grown: { ...face, instructions: [...face.instructions, ...taken] },
      shrunkNext: { ...nextFace, instructions: nextFace.instructions.slice(taken.length) },
    };
  }

  return null;
}

export function RecipeFaceMeasurer({
  recipe,
  size,
  template,
  hasPhoto,
  showSourceUrl,
  onSettled,
}: {
  recipe: Recipe;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  hasPhoto: boolean;
  showSourceUrl: boolean;
  onSettled: (pages: RecipeFace[]) => void;
}) {
  const initialPages = useMemo(
    () => getRecipeFaces(recipe, size, { hasPhoto, showSourceUrl, template }).pages,
    [recipe, size, template, hasPhoto, showSourceUrl],
  );

  const [pages, setPages] = useState<RecipeFace[]>(initialPages);
  const passRef = useRef(0);
  const forcedStackedRef = useRef(false);
  const settledRef = useRef(false);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  // A pull and a pop are each other's exact inverse (move one item between
  // adjacent faces), and pulling can shift a wide section's whole 2-column
  // split non-linearly — one more item can move several others between
  // columns, not just add itself. So a pull that looked safe against this
  // pass's real measurement can turn out, once actually laid out, to overflow
  // after all; the pop path then reverses it, slack reappears, and it pulls
  // right back — an A/B cycle that never settles on its own. Tracking every
  // page-shape seen this recipe catches that: a repeat means keep the last
  // known-good shape instead of oscillating forever.
  const seenSignaturesRef = useRef<Set<string>>(new Set());

  // Any change to the recipe/settings invalidates whatever this had settled
  // on and starts a fresh measurement pass. `initialPages` is already
  // recomputed (a fresh array) exactly when recipe/size/template/hasPhoto/
  // showSourceUrl actually change, so comparing its reference is enough —
  // reset synchronously during render (not in an effect) so the stale pages
  // never get measured/reported as if they were current.
  const lastInitialPagesRef = useRef(initialPages);
  if (lastInitialPagesRef.current !== initialPages) {
    lastInitialPagesRef.current = initialPages;
    passRef.current = 0;
    forcedStackedRef.current = false;
    settledRef.current = false;
    seenSignaturesRef.current = new Set();
    setPages(initialPages);
  }

  useLayoutEffect(() => {
    if (settledRef.current) return;

    if (passRef.current >= MAX_REFLOW_PASSES) {
      settledRef.current = true;
      onSettled(pages);
      return;
    }
    passRef.current += 1;

    let changed = false;
    let restartStacked = false;
    const next = pages.slice();

    // Relieve overflow first — never pull more onto a face that's already
    // over its own budget this same pass.
    for (let i = 0; i < next.length; i++) {
      const cardEl = cardRefs.current[i];
      if (!cardEl) continue;

      const overflowPx = colsOverflowPx(cardEl);
      if (overflowPx <= OVERFLOW_TOLERANCE_PX) continue;

      const page = next[i];
      if (page.layout === "standard") {
        // The side-by-side front doesn't actually fit after all. Start over
        // with the stacked layout the rest of the split logic already uses
        // whenever anything spills past the front, instead of trying to
        // finesse two independent columns down to size.
        if (!forcedStackedRef.current) {
          forcedStackedRef.current = true;
          restartStacked = true;
          break;
        }
        continue;
      }

      const popped = popTrailingItems(page, overflowPx, cardEl);
      if (!popped) continue;

      next[i] = popped.shrunk;
      const nextFace = next[i + 1] ?? blankStackedFace();
      next[i + 1] = prependItems(nextFace, popped.kind, popped.items);
      changed = true;
    }

    if (restartStacked) {
      setPages(getRecipeFaces(recipe, size, { hasPhoto, showSourceUrl, template, forceStacked: true }).pages);
      return;
    }

    // Only once nothing overflowed this round, look for slack to pull the
    // next face's leading content into — one pull per pass, so the next
    // pass always measures a fully-settled previous state rather than a
    // same-pass mutation whose real height hasn't been rendered yet.
    if (!changed) {
      for (let i = 0; i < next.length - 1; i++) {
        if (next[i].layout === "standard") continue;
        if (isEmptyFace(next[i + 1])) continue;

        const cardEl = cardRefs.current[i];
        const nextCardEl = cardRefs.current[i + 1];
        if (!cardEl || !nextCardEl) continue;

        const slackPx = -colsOverflowPx(cardEl) - OVERFLOW_TOLERANCE_PX;
        if (slackPx <= 0) continue;

        const pulled = pullLeadingItems(next[i], next[i + 1], slackPx, nextCardEl);
        if (!pulled) continue;

        next[i] = pulled.grown;
        next[i + 1] = pulled.shrunkNext;
        changed = true;
        break;
      }
    }

    if (changed) {
      // Drop any page a pop/pull left with nothing on it (its whole content
      // moved elsewhere) so a corrected recipe doesn't end with a blank side.
      const pruned = next.filter((face, i) => i === 0 || !isEmptyFace(face));
      const signature = pruned.map((face) => `${face.layout}:${face.ingredients.length}:${face.instructions.length}`).join("|");
      if (seenSignaturesRef.current.has(signature)) {
        // Seen this exact page shape before this recipe — a pull/pop cycle,
        // not real progress. Settle on the current (already-rendered, known
        // not to be actively overflowing past this point) state instead of
        // oscillating until the pass cap.
        settledRef.current = true;
        onSettled(pages);
        return;
      }
      seenSignaturesRef.current.add(signature);
      setPages(pruned);
      return;
    }

    settledRef.current = true;
    onSettled(pages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        visibility: "hidden",
        pointerEvents: "none",
        zIndex: -1,
      }}
      className={`recipe-print-preview recipe-print-preview--${size}`}
    >
      <div className={`recipe-card-set recipe-template--${template}`}>
        {pages.map((page, i) => (
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[i] = (el?.firstElementChild as HTMLElement | undefined) ?? null;
            }}
          >
            <RecipeCardFace
              recipe={recipe}
              ingredients={page.ingredients}
              instructions={page.instructions}
              side={i === 0 ? "front" : "back"}
              showHeader={i === 0}
              layout={page.layout}
              hasBackFace={pages.length > 1}
              showImage={i === 0 && hasPhoto}
              showSourceUrl={showSourceUrl}
              continued={i > 0}
              template={template}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
