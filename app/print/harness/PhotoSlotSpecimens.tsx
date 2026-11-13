"use client";

import type { CSSProperties } from "react";
import {
  RecipeCardFace,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  previewSizeClass,
  type PrintCardSize,
} from "@/components/RecipeCardPrint";
import { getCookbookPreset, presetCardVars } from "@/lib/cookbookPresets";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { Recipe } from "@/types/recipe";

/**
 * `/print/harness?photoslot=1`: a recipe page whose photo is on but not added
 * yet (a book of the cook's own photos), on every theme and size, card and
 * book, read-only and under edit. On screen it holds the photo's place; on
 * paper it must draw nothing at all, not even the theme's frame around the
 * missing photo. e2e/empty-photo-never-prints.spec.ts holds it to that.
 */

const noop = () => {};

const EDIT: RecipeCardInlineEdit = {
  editingTarget: null,
  value: "",
  onFocusTarget: noop,
  onValueChange: noop,
  onCommit: noop,
  onSetLineKind: noop,
  onCancel: noop,
  onInsertIngredient: noop,
  onInsertStep: noop,
  onSplitLine: noop,
  onDeleteLines: noop,
  onRemoveBranding: noop,
};

const RECIPE: Recipe = {
  title: "Plain Beans",
  ingredients: [{ name: "1 can beans" }, { name: "1 pinch salt" }],
  instructions: [{ step: 1, text: "Warm the beans." }],
};

const BOOK_CARD_VARS = presetCardVars(getCookbookPreset(undefined)) as CSSProperties;

export function PhotoSlotSpecimens() {
  const sizes: PrintCardSize[] = ["letter", "card-6x4"];
  return (
    <div data-photo-slot-specimens-ready="1" style={{ padding: 24 }}>
      {[false, true].flatMap((book) =>
        (book ? (["letter"] as PrintCardSize[]) : sizes).flatMap((size) =>
          RECIPE_PRINT_TEMPLATE_OPTIONS.flatMap(({ id: template }) =>
            [false, true].map((editing) => (
              <div
                key={`${book}|${size}|${template}|${editing}`}
                data-photo-slot-specimen={`${book ? "book" : "card"}|${size}|${template}|${editing ? "editing" : "read"}`}
                className={`recipe-print-preview ${previewSizeClass(size)}`}
                style={{ marginBottom: 24, ...(book ? BOOK_CARD_VARS : {}) }}
              >
                <div className={`recipe-card-set recipe-template--${template}`}>
                  <div className="recipe-card-page recipe-card-page--front">
                    <RecipeCardFace
                      recipe={RECIPE}
                      ingredients={RECIPE.ingredients}
                      instructions={RECIPE.instructions}
                      side="front"
                      showHeader
                      layout="standard"
                      hasBackFace={false}
                      showImage
                      photoPlaceholder
                      inlineEdit={editing ? EDIT : undefined}
                      template={template}
                      cookbookMode={book}
                    />
                  </div>
                </div>
              </div>
            )),
          ),
        ),
      )}
    </div>
  );
}
