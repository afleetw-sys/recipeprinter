"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RecipeCardFace,
  getRecipeFaces,
  previewSizeClass,
  type PrintCardSize,
  type RecipeFace,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import {
  INGREDIENT_ITEM_SELECTOR,
  INSTRUCTION_ITEM_SELECTOR,
  OVERFLOW_TOLERANCE_PX,
  blankStackedFace,
  colsOverflowPx,
  faceMeasureDetail,
  isEmptyFace,
  realItemHeights,
} from "@/lib/faceMeasure";
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

// A pass must not read geometry until the card has stopped moving. Each card
// measures itself (`useWideColumns` picks its two-column split from a hidden
// probe, then re-renders, and can land back on a single column), so an early
// read sees a transient layout: one face reported 62px of slack that actually
// overflowed by 32px once settled, the loop "fitted" it, and the content
// clipped. Rather than guess a fixed delay — which silently depends on machine
// speed — each pass polls the measured geometry and only proceeds once two
// consecutive readings agree. Fast when the card settles immediately, patient
// when it doesn't, and correct on any machine.
const STABILITY_POLL_MS = 16;
// 6, not a larger number: a card that is going to settle does so within a
// poll or two, and one that never settles (bistable column split) will burn
// the whole budget every pass without ever agreeing — so a high cap only adds
// latency for the pathological case without changing its outcome.
const MAX_STABILITY_POLLS = 6;

// Hard ceiling on passes. Some content makes a card's own layout bistable — a
// step tall enough to sit right at the two-column threshold flips the split
// back and forth, so the geometry never stabilizes and every pass spends the
// full poll budget. Such a recipe cannot be rescued by more pagination (it
// needs smaller type — see the oversized case), and grinding on only delays
// the result while `printLayoutReady` stays false and Print stays disabled.
// Measured convergence for well-behaved recipes peaks around 8 passes, so this
// budget never binds on them while guaranteeing the loop always terminates
// promptly on the pathological ones.
const MAX_SETTLE_PASSES = 12;

// Extra room, beyond the line's own height, that a face must have spare before
// the pull will move content up into it. See the pull site for why.
const PULL_HYSTERESIS_PX = 12;

// Floor on shrink-to-fit. A face whose single remaining item still overflows
// can only be rescued by smaller type, but there's a point past which the card
// stops being readable at arm's length on a kitchen counter — better to clip a
// truly absurd step than to print something nobody can read. 0.75 buys back a
// third of the height, which covers the realistic "one very long step" case.
const MIN_CONTENT_SCALE = 0.75;

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

// A face that gains its first ingredient/step also gains that section's label
// ("INGREDIENTS" / "STEPS"), which costs real vertical space the moved item's
// own height doesn't include. Without charging it, the pull would move a step
// onto a steps-less face using slack that the new label then consumes, the
// face would overflow, the pop would push it straight back, and the pair
// oscillated until the loop gave up on the un-pulled arrangement — leaving
// ~25-33px stranded (the label's height) on exactly the cards that looked
// under-filled. Measured off the next face, which already renders the label.
function sectionLabelCostPx(
  face: RecipeFace,
  kind: "instructions" | "ingredients",
  nextCardEl: HTMLElement,
): number {
  const alreadyHasSection =
    kind === "instructions" ? face.instructions.length > 0 : face.ingredients.length > 0;
  if (alreadyHasSection) return 0;
  const label = nextCardEl.querySelector<HTMLElement>(
    kind === "instructions"
      ? ".recipe-card__method .recipe-card__label"
      : ".recipe-card__ingredients .recipe-card__label",
  );
  if (!label) return 0;
  const style = getComputedStyle(label);
  return (
    label.getBoundingClientRect().height +
    (parseFloat(style.marginTop) || 0) +
    (parseFloat(style.marginBottom) || 0)
  );
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
    const budget = slackPx - sectionLabelCostPx(face, "ingredients", nextCardEl);
    const taken = takeLeadingItems(nextFace.ingredients, budget, heights);
    if (taken.length === 0) return null;
    return {
      grown: { ...face, ingredients: [...face.ingredients, ...taken] },
      shrunkNext: { ...nextFace, ingredients: nextFace.ingredients.slice(taken.length) },
    };
  }

  if (nextFace.instructions.length > 0 && (face.instructions.length > 0 || nextFace.ingredients.length === 0)) {
    const heights = realItemHeights(nextCardEl, INSTRUCTION_ITEM_SELECTOR);
    const budget = slackPx - sectionLabelCostPx(face, "instructions", nextCardEl);
    const taken = takeLeadingItems(nextFace.instructions, budget, heights);
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
  cookbookMode = false,
  onSettled,
}: {
  recipe: Recipe;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  hasPhoto: boolean;
  showSourceUrl: boolean;
  /** Match the real card's cookbook layout (link in header, no footer) so the
      off-screen measurement reflects what actually prints. */
  cookbookMode?: boolean;
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
  // The last measured page arrangement in which every face actually fit. The
  // pop/pull loop can oscillate near a boundary (the pull re-grows a face the
  // pop just relieved, because it sizes items by the *next* face's columns,
  // which differ from where they land), and when that oscillation runs out the
  // `MAX_SETTLE_PASSES` clock, the arrangement it happens to stop on can be an
  // overflowing one — that was a direct cause of settled cards clipping. A
  // fitting arrangement is always visited on the way (right after each pop), so
  // remembering it and settling on it instead guarantees the reported result
  // never clips whenever any fitting arrangement exists.
  const bestFitRef = useRef<RecipeFace[] | null>(null);

  // Don't measure until webfonts are loaded. Measuring in the fallback font —
  // which is what happens if the first `useLayoutEffect` runs before the real
  // font is ready — reads narrower/shorter text, so an overflowing face looks
  // like it fits, the loop settles, and then the real font loads and pushes
  // content past the fixed card height with no further pass to catch it. That
  // is both a direct cause of clipped 6x4 cards and the "reflows a few seconds
  // later" flash. `document.fonts.ready` resolves once faces are usable.
  const [fontsReady, setFontsReady] = useState(
    () => typeof document === "undefined" || !document.fonts || document.fonts.status === "loaded",
  );
  useEffect(() => {
    if (fontsReady || typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fontsReady]);

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
    bestFitRef.current = null;
    setPages(initialPages);
  }

  // Deliberately a post-paint `useEffect` + macrotask, NOT `useLayoutEffect`.
  // Each card does its own internal measuring (`useWideColumns` decides the
  // two-column split from a hidden probe and then re-renders), and a layout
  // effect runs before that has stabilized — so the loop was reading a
  // transient DOM. It measured a back face at 62px of slack that, once the
  // card settled, actually overflowed by 32px: the loop saw "fits", settled
  // immediately, and the content clipped. Deferring by one macrotask lets the
  // card reach its final geometry first, so every pass measures what really
  // prints. This also removes the nested-update hazard the old synchronous
  // loop had, since these updates are no longer nested inside a commit.
  useEffect(() => {
    if (settledRef.current) return;
    // Wait for real fonts before the first (and every) measurement pass — see
    // `fontsReady` above. Once it flips true this effect re-runs and settles.
    if (!fontsReady) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastSignature: string | null = null;
    let polls = 0;

    // Rounded per-face overflow — the geometry this pass is about to act on.
    // Two identical readings in a row mean the cards have stopped reflowing.
    const signature = () =>
      pages
        .map((_, i) => {
          const el = cardRefs.current[i];
          return el ? Math.round(colsOverflowPx(el)) : "x";
        })
        .join(",");

    const tick = () => {
      if (cancelled || settledRef.current) return;
      const sig = signature();
      if (sig !== lastSignature && polls < MAX_STABILITY_POLLS) {
        lastSignature = sig;
        polls += 1;
        timer = setTimeout(tick, STABILITY_POLL_MS);
        return;
      }
      runPass();
    };

    timer = setTimeout(tick, STABILITY_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };

    // Last-resort guarantee that nothing is ever reported clipped. Reached only
    // when the pass budget ran out without any fully-fitting arrangement — in
    // practice a card whose own column layout is bistable, so measurements
    // disagree pass to pass and the split never converges. Pagination has
    // demonstrably failed by this point, so shrink whatever still overflows
    // until it fits. Cutting a step off mid-sentence is the one outcome that
    // makes a printed card useless; slightly smaller type is not.
    function shrinkOverflowingFaces(current: RecipeFace[]): RecipeFace[] {
      return current.map((face, i) => {
        const cardEl = cardRefs.current[i];
        if (!cardEl) return face;
        const overflowPx = colsOverflowPx(cardEl);
        if (overflowPx <= OVERFLOW_TOLERANCE_PX) return face;
        const { availableHeightPx } = faceMeasureDetail(cardEl);
        const contentHeight = availableHeightPx + overflowPx;
        if (availableHeightPx <= 0 || contentHeight <= 0) return face;
        const needed = (availableHeightPx / contentHeight) * 0.98;
        const scale = Math.max(MIN_CONTENT_SCALE, (face.contentScale ?? 1) * needed);
        return scale < (face.contentScale ?? 1) ? { ...face, contentScale: scale } : face;
      });
    }

    function runPass() {
    if (passRef.current >= MAX_SETTLE_PASSES) {
      settledRef.current = true;
      // Prefer the best fitting arrangement seen over whatever oscillating
      // state the pass clock happened to stop on (see `bestFitRef`).
      onSettled(bestFitRef.current ?? shrinkOverflowingFaces(pages));
      return;
    }
    passRef.current += 1;

    let changed = false;
    let restartStacked = false;
    let anyOverflow = false;
    const next = pages.slice();

    // Relieve overflow first — never pull more onto a face that's already
    // over its own budget this same pass.
    for (let i = 0; i < next.length; i++) {
      const cardEl = cardRefs.current[i];
      if (!cardEl) continue;

      const overflowPx = colsOverflowPx(cardEl);
      if (overflowPx <= OVERFLOW_TOLERANCE_PX) continue;
      anyOverflow = true;

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

      // A face down to a single item that still overflows is the one case
      // pagination cannot win: popping it would empty this face and hand the
      // same item to the next one, where it overflows identically — the loop
      // would shuffle it forward forever. Shrink it to fit instead.
      if (page.ingredients.length + page.instructions.length === 1) {
        const { availableHeightPx } = faceMeasureDetail(cardEl);
        const contentHeight = availableHeightPx + overflowPx;
        if (availableHeightPx > 0 && contentHeight > 0) {
          // 0.98 so it lands just inside the edge rather than exactly on it.
          const needed = (availableHeightPx / contentHeight) * 0.98;
          const nextScale = Math.max(MIN_CONTENT_SCALE, (page.contentScale ?? 1) * needed);
          if (nextScale < (page.contentScale ?? 1)) {
            next[i] = { ...page, contentScale: nextScale };
            changed = true;
          }
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

    // The pages measured this pass all fit — remember them as the fallback the
    // MAX_SETTLE_PASSES guard settles on, so oscillation can never strand an
    // overflowing arrangement as the final result.
    if (!anyOverflow) {
      bestFitRef.current = pages;
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

        // Hysteresis, not a ban. The pull is the pop's exact inverse, so
        // matching thresholds make them fight forever: a pop sheds a trailing
        // item, the freed space reads as slack, the pull drags the same item
        // straight back, and the face overflows again. Requiring the slack to
        // exceed what the content needs by a clear margin breaks that cycle —
        // a just-popped item frees roughly its own height, which is never
        // enough to clear the margin — while still letting a genuinely
        // under-filled face pull the next line up. (Banning the pull outright
        // also stopped the cycle, but it stranded content on later faces and
        // left cards half empty.)
        const slackPx = -colsOverflowPx(cardEl) - OVERFLOW_TOLERANCE_PX - PULL_HYSTERESIS_PX;
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
      // A pull and a pop are each other's exact inverse, and pulling can
      // shift a wide section's whole 2-column split non-linearly, so a state
      // that looked safe can turn out not to be, and genuinely cycle A/B/A/B
      // for a few passes before settling — that's fine, `MAX_SETTLE_PASSES`
      // above is the backstop for it. This used to also bail out the moment
      // any pruned shape repeated, on the theory that a repeat could only
      // mean an unwinnable cycle — but the same signature also shows up when
      // two effect invocations run back-to-back against the *same*,
      // not-yet-rendered `pages` (React's dev-only Strict Mode double-invokes
      // effects, so this isn't rare), and there it's not a cycle at all, just
      // a duplicate computation of a pass that hasn't even had a chance to
      // render yet. Bailing out there settles on a state whose own overflow
      // was never checked, discarding this pass's real fix. Always applying
      // the pass and letting the loop continue avoids the false positive.
      const pruned = next.filter((face, i) => i === 0 || !isEmptyFace(face));
      setPages(pruned);
      return;
    }

    settledRef.current = true;
    onSettled(pages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, fontsReady]);

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
      className={`recipe-print-preview ${previewSizeClass(size)} recipe-face-measurer`}
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
              contentScale={page.contentScale}
              template={template}
              cookbookMode={cookbookMode}
              // This whole subtree is `visibility: hidden` and only ever read
              // for `.recipe-card__cols` geometry (see lib/faceMeasure.ts).
              // The decorative layer is absolutely positioned, so it changes
              // nothing this measures — it was pure cost.
              showDecoration={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
