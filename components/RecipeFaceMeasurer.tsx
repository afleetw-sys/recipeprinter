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

// The front/back split in RecipeCardPrint is driven by a character-count
// budget, not the recipe's actual rendered size — fonts, wrapping, and section
// headers don't cost exactly what the heuristic assumes, so a face
// occasionally comes out a little too full and prints truncated by the fixed
// card height's `overflow: hidden`. This component renders the heuristic's
// guess off-screen at real size, measures whether each face actually
// overflows, and if so pops items onto the next face (creating one if
// needed) until every face's real height fits — then reports the corrected
// pages back. It's the ground-truth safety net behind the budget guess, not a
// replacement for it (the guess still drives the first, usually-correct pass
// so this rarely has to move more than an item or two).

const MAX_REFLOW_PASSES = 60;
const OVERFLOW_TOLERANCE_PX = 1;

function blankStackedFace(): RecipeFace {
  return { ingredients: [], instructions: [], layout: "stacked" };
}

function isEmptyFace(face: RecipeFace): boolean {
  return face.ingredients.length === 0 && face.instructions.length === 0;
}

interface PopResult {
  shrunk: RecipeFace;
  kind: "instructions" | "ingredients";
  items: Recipe["instructions"] | Recipe["ingredients"];
}

// Pops however many trailing items from the overflowing section look needed
// to clear `overflowPx`, estimated from that section's own average item
// height so a badly-wrong guess (e.g. many long steps) doesn't take dozens of
// one-item-at-a-time passes to resolve.
function popTrailingItems(
  face: RecipeFace,
  overflowPx: number,
  sectionHeights: { ingredients: number | null; instructions: number | null },
): PopResult | null {
  const useInstructions = face.instructions.length > 0;
  const useIngredients = !useInstructions && face.ingredients.length > 0;
  if (!useInstructions && !useIngredients) return null;

  const kind: "instructions" | "ingredients" = useInstructions ? "instructions" : "ingredients";
  const items = face[kind];
  const sectionHeight = sectionHeights[kind];
  const avgItemHeight = sectionHeight && items.length > 0 ? sectionHeight / items.length : null;
  const estimatedCount = avgItemHeight ? Math.ceil(overflowPx / avgItemHeight) : 1;
  const popCount = Math.min(items.length, Math.max(1, estimatedCount));

  const kept = items.slice(0, items.length - popCount);
  const spilled = items.slice(items.length - popCount);

  return {
    shrunk: { ...face, [kind]: kept } as RecipeFace,
    kind,
    items: spilled as Recipe["instructions"] & Recipe["ingredients"],
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

    for (let i = 0; i < next.length; i++) {
      const cardEl = cardRefs.current[i];
      if (!cardEl) continue;

      const targetHeight = parseFloat(getComputedStyle(cardEl).minHeight) || 0;
      const overflowPx = cardEl.scrollHeight - targetHeight;
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

      const ingredientsEl = cardEl.querySelector<HTMLElement>(".recipe-card__ingredients");
      const instructionsEl = cardEl.querySelector<HTMLElement>(".recipe-card__method");
      const popped = popTrailingItems(page, overflowPx, {
        ingredients: ingredientsEl?.scrollHeight ?? null,
        instructions: instructionsEl?.scrollHeight ?? null,
      });
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

    if (changed) {
      // Drop any page a pop left with nothing on it (its whole content moved
      // to the next face) so a corrected recipe doesn't end with a blank side.
      const pruned = next.filter((face, i) => i === 0 || !isEmptyFace(face));
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
