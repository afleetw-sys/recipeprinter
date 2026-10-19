"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  RecipeCardFace,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { PAGE_DIMS } from "@/lib/printGeometry";
import type { Recipe } from "@/types/recipe";

// Short on purpose: the thumbnail draws this at about one and a half times the card's own
// type size (see `.recipe-template-option__scaler` in print.css), so it has to
// fit a 6x4 card at that size with room left for a theme's art.
const THUMB_RECIPE: Recipe = {
  title: "Lemon Pasta",
  servings: 4,
  totalTime: "25 min",
  ingredients: [
    { name: "12 oz spaghetti" },
    { name: "2 lemons" },
    { name: "1 cup parmesan" },
  ],
  instructions: [
    { step: 1, text: "Boil the spaghetti." },
    { step: 2, text: "Toss with lemon and parmesan." },
  ],
};

// The theme picker thumbnails render the *real* card (the same RecipeCardFace
// the print output uses) shrunk to fit, rather than a hand-built HTML mockup
// styled to approximate it. The mockups drifted from the real templates —
// different spacing, stray image placeholders, a BBQ preview that didn't look
// like the BBQ card — because nothing kept them in sync. A scaled real card
// can't drift: it *is* the template.
const TEMPLATE_THUMB_SIZE: PrintCardSize = "card-6x4";
// The WHOLE card, fit to the cell's width. It used to zoom to 1.95x and crop
// to the card's top half so the sample recipe's type was legible, which cut
// off every theme whose art sits at the foot of the card (Garden's tomatoes,
// the cutlery, the groceries, Heirloom): nothing in the picker said they had
// any. Every theme now shows top and bottom alike, and the sample recipe is
// kept legible by enlarging its type inside the card (print.css) rather than
// by zooming the card itself.

export function TemplateThumbnail({
  template,
  recipe = THUMB_RECIPE,
}: {
  template: RecipePrintTemplate;
  /** Another short sample, where several previews sit together (the referral invite). */
  recipe?: Recipe;
}) {
  const dims = PAGE_DIMS[TEMPLATE_THUMB_SIZE];
  const ref = useRef<HTMLDivElement | null>(null);
  // Fit the fixed-size real card to whatever width the picker cell happens to
  // be (it varies with panel/drawer width), the same transform-scale trick
  // ScaledPage uses. Starts at a sensible guess so
  // first paint is close; the observer sets the exact scale from the measured
  // cell width.
  const [scale, setScale] = useState(0.22);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / dims.w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dims.w]);

  return (
    <div ref={ref} className="recipe-template-option__thumb" aria-hidden>
      <div
        className="recipe-page-scaler recipe-template-option__scaler"
        style={
          {
            "--page-scale": scale,
            "--page-w": `${dims.w}px`,
            "--page-h": `${dims.h}px`,
          } as CSSProperties
        }
      >
        <div className="recipe-page-scaler__inner">
          <div className={`recipe-print-preview recipe-print-preview--${TEMPLATE_THUMB_SIZE}`}>
            <div
              className={`recipe-card-set recipe-card-set--${TEMPLATE_THUMB_SIZE} recipe-template--${template}`}
            >
              <div className="recipe-card-page recipe-card-page--front">
                <RecipeCardFace
                  recipe={recipe}
                  ingredients={recipe.ingredients}
                  instructions={recipe.instructions}
                  side="front"
                  showHeader
                  layout="standard"
                  hasBackFace={false}
                  showImage={Boolean(recipe.image)}
                  template={template}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
