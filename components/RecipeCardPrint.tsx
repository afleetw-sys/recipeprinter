"use client";

import { Fragment, memo, useEffect, useState } from "react";
import { formatRecipeTime } from "@/lib/time";
import { ICON_SIZE, XIcon } from "@/components/icons";
import {
  getRecipeFaces,
  ingredientText,
  metaBits,
  recipeNeedsBackSide,
  sectionGroups,
  sourceLabel,
  type RecipeCardEditTarget,
  type RecipeCardInlineEdit,
  type RecipeFace,
  type RecipeFaces,
} from "@/lib/recipeCardLayout";
import type { Recipe } from "@/types/recipe";

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

export type RecipePrintTemplate =
  | "classic"
  | "heirloom"
  | "bistro"
  | "pantry"
  | "counter"
  | "keepsake";
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
];

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
  showSourceUrl = false,
  continued = false,
  inlineEdit,
  template,
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
  showSourceUrl?: boolean;
  continued?: boolean;
  inlineEdit?: RecipeCardInlineEdit;
  template?: RecipePrintTemplate;
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
  // The photo only rides along on the front face (where the header lives). If
  // the source image 404s or is hotlink-blocked we drop it rather than print a
  // broken-image box.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [recipe.image]);
  // Individually-drawn rects, not an SVG <pattern> tile (and before that, a
  // tiled CSS gradient) — both of those get pre-rasterized to a fixed-DPI
  // bitmap by Chrome's print/PDF pipeline even though they render crisply
  // on screen, which is what actually turned this checkerboard blocky in
  // exported PDFs. Plain vector geometry has no tile to rasterize, so it
  // stays crisp at any print DPI. 48 bands (0.24in each) comfortably covers
  // the tallest card (11in letter); any extra past the real card height is
  // clipped by the SVG's own viewport, which is sized to the card by CSS.
  const checkerBands = 48;
  const showPhoto = showHeader && !imageFailed && (showImage && Boolean(recipe.image));

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

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") inlineEdit?.onCommit(reader.result);
    };
    reader.readAsDataURL(file);
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

  // Renders the click target that inserts a new blank ingredient/step.
  // `variant: "hover"` sits absolutely inside the preceding line and only
  // shows on hover (so it never affects layout when idle); `"empty"` is the
  // permanent one shown in place of a section that has nothing in it yet.
  function addLine(kind: "ingredient" | "step", index: number, variant: "hover" | "empty" = "hover") {
    if (!canEdit || !inlineEdit) return null;
    const label = kind === "ingredient" ? "Add ingredient" : "Add step";
    return (
      <button
        type="button"
        className={`recipe-card__add-line no-print ${
          variant === "empty" ? "recipe-card__add-line--empty" : ""
        }`}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          if (kind === "ingredient") insertIngredientAt(index);
          else insertStepAt(index);
        }}
      >
        <span className="recipe-card__add-line-text">+ {label}</span>
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
    // Unlike ingredient/step lines (real inputs the whole time edit mode is
    // on), this one only becomes a real <input> while it's the active field.
    // A permanently-mounted <input> here — even one whose box is pixel-
    // identical to the <h3> it replaces — throws off the browser's
    // column-balance for the wide/stacked two-column layout below (a form
    // control fragments differently than a heading, balance-height math and
    // all), which is what was shifting ingredients/steps between columns
    // just from opening Edit. Mounting it only on demand keeps every idle
    // title a plain <h3>, identical to view mode.
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
      <input
        ref={focusIfEditing(target)}
        className="recipe-card__inline-input recipe-card__section-title"
        value={inlineEdit.value}
        aria-label="Section title"
        onChange={(event) => inlineEdit.onValueChange(event.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleEditKeyDown}
      />
    );
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
      {template === "bistro" && (
        <div className="recipe-card__checker" aria-hidden>
          <svg width="100%" height="100%" focusable="false">
            {Array.from({ length: checkerBands }, (_, band) => {
              const y = band * 0.24;
              return (
                <Fragment key={band}>
                  <rect x="0" y={`${y}in`} width="0.24in" height="0.24in" fill="#f8fffe" />
                  <rect x="0.12in" y={`${y}in`} width="0.12in" height="0.12in" fill="#1479c9" />
                  <rect x="0" y={`${y + 0.12}in`} width="0.12in" height="0.12in" fill="#1479c9" />
                  <line
                    x1="0.12in"
                    y1={`${y}in`}
                    x2="0.24in"
                    y2={`${y + 0.12}in`}
                    stroke="#5fb0e6"
                    strokeWidth="0.003in"
                  />
                  <line
                    x1="0"
                    y1={`${y + 0.12}in`}
                    x2="0.12in"
                    y2={`${y + 0.24}in`}
                    stroke="#5fb0e6"
                    strokeWidth="0.003in"
                  />
                </Fragment>
              );
            })}
          </svg>
        </div>
      )}

      {showHeader ? (
        <header
          className={`recipe-card__header ${
            showPhoto ? "recipe-card__header--with-photo" : ""
          }`}
        >
          <div className="recipe-card__headline">
            {canEdit && inlineEdit ? (
              <input
                className="recipe-card__inline-input recipe-card__title"
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
            {canEdit && inlineEdit ? (
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
          </div>
          {showPhoto && (
            <span className={`recipe-card__photo ${canEdit ? "recipe-card__photo--editable" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="recipe-card__photo-img"
                src={recipe.image}
                alt={recipe.title ? `Photo of ${recipe.title}` : "Recipe photo"}
                decoding="async"
                onError={() => setImageFailed(true)}
              />
              {canEdit && inlineEdit && (
                <>
                  <label className="recipe-card__photo-edit">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only absolute h-px w-px overflow-hidden"
                      onChange={handleImageChange}
                    />
                  </label>
                  <button
                    type="button"
                    className="recipe-card__photo-remove"
                    aria-label="Remove photo"
                    onClick={() => inlineEdit.onCommit("")}
                  >
                    <XIcon size={ICON_SIZE.xs} />
                  </button>
                </>
              )}
            </span>
          )}
        </header>
      ) : null}

      <div
        className={`recipe-card__cols ${
          !hasIngredientsSection ? "recipe-card__cols--single" : ""
        } ${ingredientsOnly ? "recipe-card__cols--ingredients-only" : ""} ${
          methodOnly ? "recipe-card__cols--method-only" : ""
        } ${stackedLayout ? "recipe-card__cols--stacked" : ""}`}
      >
        {hasIngredientsSection && (
          <section
            className={`recipe-card__ingredients ${
              ingredientsOnly || stackedLayout ? "recipe-card__ingredients--wide" : ""
            }`}
          >
            <h2 className="recipe-card__label">Ingredients</h2>
            <div className="recipe-card__section-groups">
              {ingredientGroups.length === 0
                ? showEmptyIngredients && (
                    <div className="recipe-card__section-group">
                      <ul>
                        <li className="recipe-card__editable-line">
                          {addLine("ingredient", 0, "empty")}
                        </li>
                      </ul>
                    </div>
                  )
                : ingredientGroups.map((group, groupIndex) => (
                    <div
                      className="recipe-card__section-group"
                      key={`${group.title ?? "ingredients"}-${groupIndex}`}
                    >
                      {group.title &&
                        sectionTitle(
                          "ingredientSection",
                          recipe.ingredients.indexOf(group.items[0]),
                          group.title,
                        )}
                      <ul>
                        {group.items.map((ing, i) => {
                          const index = recipe.ingredients.indexOf(ing);
                          const target: RecipeCardEditTarget = { kind: "ingredient", index };
                          const text = ingredientText(ing);
                          const isEditingThis = inlineEdit && sameTarget(inlineEdit.editingTarget, target);
                          const displayValue = isEditingThis ? inlineEdit!.value : text;
                          return (
                            <li key={`${groupIndex}-${i}`} className="recipe-card__editable-line">
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
                              {addLine("ingredient", index + 1)}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
            </div>
          </section>
        )}

        {hasInstructionsSection && (
          <section
            className={`recipe-card__method ${
              methodOnly || stackedLayout ? "recipe-card__method--wide" : ""
            }`}
          >
            <h2 className="recipe-card__label">
              Steps
              {side === "front" && hasBackFace && !continued ? (
                <span className="recipe-card__continued-inline"> (continued on back)</span>
              ) : side === "back" || continued ? (
                " continued"
              ) : (
                ""
              )}
            </h2>
            <div className="recipe-card__section-groups">
              {instructionGroups.length === 0
                ? showEmptyInstructions && (
                    <div className="recipe-card__section-group">
                      <ol>
                        <li className="recipe-card__editable-line">
                          {addLine("step", 0, "empty")}
                        </li>
                      </ol>
                    </div>
                  )
                : instructionGroups.map((group, groupIndex) => (
                    <div
                      className="recipe-card__section-group"
                      key={`${group.title ?? "steps"}-${groupIndex}`}
                    >
                      {group.title &&
                        sectionTitle(
                          "instructionSection",
                          recipe.instructions.indexOf(group.items[0]),
                          group.title,
                        )}
                      <ol>
                        {group.items.map((step) => {
                          const index = recipe.instructions.indexOf(step);
                          const target: RecipeCardEditTarget = { kind: "step", index };
                          const isEditingThis = inlineEdit && sameTarget(inlineEdit.editingTarget, target);
                          const displayValue = isEditingThis ? inlineEdit!.value : step.text;
                          return (
                            <li
                              key={`${step.step}-${step.text.slice(0, 24)}`}
                              className="recipe-card__editable-line"
                            >
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
                              {addLine("step", index + 1)}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ))}
            </div>
          </section>
        )}
      </div>

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
    </article>
  );
});
