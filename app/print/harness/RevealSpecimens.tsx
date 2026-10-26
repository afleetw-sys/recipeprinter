"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  CoverFace,
  DividerFace,
  RecipeCardFace,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  previewSizeClass,
  type CoverCardInlineEdit,
  type DividerCardInlineEdit,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { getCookbookPreset, presetCardVars } from "@/lib/cookbookPresets";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { CoverConfig, Recipe } from "@/types/recipe";

/**
 * `/print/harness?reveal=1[&book=1]`: every page that can be edited, drawn
 * twice side by side, once with "show what's missing" on and once with it
 * off, on every theme and size. The reveal's prompts ("Add servings", an
 * empty STEPS waiting for its first step) are for the screen. What prints and
 * exports is the page without them, so in print media the two copies must be
 * the same page. e2e/reveal-never-prints.spec.ts holds them to that.
 */

const noop = () => {};

const RECIPE_EDIT: RecipeCardInlineEdit = {
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

const DIVIDER_EDIT: DividerCardInlineEdit = {
  titleEditing: false,
  titleValue: "Weeknights",
  onTitleOpen: noop,
  onTitleChange: noop,
  onTitleCommit: noop,
  onTitleCancel: noop,
  onSubtitleChange: noop,
  onIntroChange: noop,
};

/** A new recipe: a title and nothing else. */
const EMPTY: Recipe = { title: "New recipe", ingredients: [], instructions: [] };
/** Half filled in: ingredients and a time, no steps, servings, note or link. */
const PARTIAL: Recipe = {
  title: "Buttered Toast",
  totalTime: "5 min",
  ingredients: [{ name: "2 slices bread" }, { name: "1 tablespoon butter" }],
  instructions: [],
};

const BOOK_CARD_VARS = presetCardVars(getCookbookPreset(undefined)) as CSSProperties;

function Pair({
  id,
  size,
  template,
  book,
  face,
}: {
  id: string;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  book: boolean;
  face: (reveal: boolean) => ReactNode;
}) {
  return (
    <div data-reveal-pair={id} style={{ display: "flex", gap: 24, marginBottom: 24 }}>
      {[true, false].map((reveal) => (
        <div
          key={String(reveal)}
          data-variant={reveal ? "reveal" : "plain"}
          className={`recipe-print-preview ${previewSizeClass(size)}`}
          style={book ? BOOK_CARD_VARS : undefined}
        >
          <div className={`recipe-card-set recipe-template--${template}`}>
            <div className="recipe-card-page recipe-card-page--front">{face(reveal)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RevealSpecimens({ book }: { book: boolean }) {
  const sizes: PrintCardSize[] = book ? ["letter"] : ["letter", "card-6x4"];
  return (
    <div data-reveal-specimens-ready="1" style={{ padding: 24 }}>
      {sizes.flatMap((size) =>
        RECIPE_PRINT_TEMPLATE_OPTIONS.flatMap(({ id: template }) => {
          const pair = (kind: string, face: (reveal: boolean) => ReactNode) => (
            <Pair
              key={`${template}|${size}|${kind}`}
              id={`${template}|${size}|${kind}`}
              size={size}
              template={template}
              book={book}
              face={face}
            />
          );
          const recipe = (kind: string, value: Recipe) =>
            pair(kind, (reveal) => (
              <RecipeCardFace
                recipe={value}
                ingredients={value.ingredients}
                instructions={value.instructions}
                side="front"
                showHeader
                layout="standard"
                hasBackFace={false}
                showSourceUrl
                inlineEdit={RECIPE_EDIT}
                showEmptyFields={reveal}
                template={template}
                cookbookMode={book}
              />
            ));
          const out = [recipe("empty", EMPTY), recipe("partial", PARTIAL)];
          if (book) {
            const cover: CoverConfig = { title: "Family Recipes", template };
            const coverEdit: CoverCardInlineEdit = { cover, onChange: noop };
            for (const side of ["front", "back", "dedication"] as const) {
              out.push(
                pair(`cover-${side}`, (reveal) => (
                  <CoverFace
                    cover={cover}
                    side={side}
                    template={template}
                    inlineEdit={coverEdit}
                    showEmptyFields={reveal}
                  />
                )),
              );
            }
            out.push(
              pair("opener", (reveal) => (
                <DividerFace
                  title="Weeknights"
                  recipeTitles={["Buttered Toast"]}
                  inlineEdit={DIVIDER_EDIT}
                  showEmptyFields={reveal}
                />
              )),
            );
          }
          return out;
        }),
      )}
    </div>
  );
}
