"use client";

import type { CSSProperties } from "react";
import {
  RecipeCardFace,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  previewSizeClass,
  type PrintCardSize,
} from "@/components/RecipeCardPrint";
import { fontScaleVars, type FontScale } from "@/lib/fontScale";
import { getCookbookPreset, presetCardVars } from "@/lib/cookbookPresets";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { Recipe } from "@/types/recipe";

/**
 * `/print/harness?specimen=1&font=<step>[&book=1]`: one of every kind of text a
 * recipe page can show, on every theme and size, laid out in plain view.
 * e2e/font-scale-coverage.spec.ts reads each text's computed size at Normal and
 * at another step and asks that all of them moved by the same factor, which is
 * how a hardcoded size (or a theme that brings one) gets caught.
 *
 * Three faces per theme: a full front (photo, headnote, facts, sectioned lists,
 * footer and link), a stacked continuation back, and an empty card being
 * edited (the empty-field prompts and the add-line buttons).
 */

const IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#cbb79a"/></svg>');

const FULL: Recipe = {
  title: "Honey Garlic Salmon",
  description: "Sticky, salty and quick. The sauce reduces while the noodles cook.",
  image: IMAGE,
  sourceUrl: "https://example.com/honey-garlic-salmon",
  servings: 4,
  totalTime: "30 min",
  ingredients: [
    { name: "2 salmon fillets", section: "Salmon" },
    { name: "1/4 teaspoon paprika", section: "Salmon" },
    { name: "3 tablespoons honey", section: "Sauce" },
    { name: "1/4 cup tamari", section: "Sauce" },
  ],
  instructions: [
    { step: 1, text: "Pat the salmon dry and season it.", section: "Salmon" },
    { step: 2, text: "Sear in sesame oil, about 3 minutes a side.", section: "Salmon" },
    { step: 3, text: "Whisk the sauce and pour it over.", section: "Finish" },
    { step: 4, text: "Simmer until glossy.", section: "Finish" },
  ],
};

const EMPTY: Recipe = { title: "New recipe", ingredients: [], instructions: [] };

const noop = () => {};
const NOOP_EDIT: RecipeCardInlineEdit = {
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

const BOOK_CARD_VARS = presetCardVars(getCookbookPreset(undefined)) as CSSProperties;

export function FontSpecimens({ fontScale, book }: { fontScale: FontScale; book: boolean }) {
  const sizes: PrintCardSize[] = book ? ["letter"] : ["letter", "card-6x4"];
  return (
    <div data-specimens-ready="1" style={{ padding: 24 }}>
      {sizes.flatMap((size) =>
        RECIPE_PRINT_TEMPLATE_OPTIONS.map(({ id: template }) => (
          <div
            key={`${template}|${size}`}
            data-specimen={`${template}|${size}`}
            className={`recipe-print-preview ${previewSizeClass(size)}`}
            style={{ ...(book ? BOOK_CARD_VARS : {}), ...fontScaleVars(fontScale), marginBottom: 24 }}
          >
            <div className={`recipe-card-set recipe-template--${template}`}>
              <RecipeCardFace
                recipe={FULL}
                ingredients={FULL.ingredients}
                instructions={FULL.instructions.slice(0, 2)}
                side="front"
                showHeader
                layout="standard"
                hasBackFace
                showImage
                showSourceUrl
                template={template}
                cookbookMode={book}
              />
              <RecipeCardFace
                recipe={FULL}
                ingredients={[]}
                instructions={FULL.instructions.slice(2)}
                side="back"
                showHeader={false}
                layout="stacked"
                hasBackFace
                showSourceUrl
                continued
                template={template}
                cookbookMode={book}
              />
              <RecipeCardFace
                recipe={EMPTY}
                ingredients={[]}
                instructions={[]}
                side="front"
                showHeader
                layout="standard"
                hasBackFace={false}
                inlineEdit={NOOP_EDIT}
                showEmptyFields
                template={template}
                cookbookMode={book}
              />
            </div>
          </div>
        )),
      )}
    </div>
  );
}
