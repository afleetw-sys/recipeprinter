"use client";

import { Fragment, memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatRecipeTime } from "@/lib/time";
import { ICON_SIZE, XIcon } from "@/components/icons";
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
  // Fruit Stand and Cookout are hidden for now — not ready to launch yet.
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
}

const BBQ_EDGE_TOP: BbqIcon[] = [
  { src: "/images/bbq-grill.svg", rotate: -11, scale: 1.15, jitter: 0.04 },
  { src: "/images/bbq-steak.svg", rotate: 14, flip: true, scale: 0.8, jitter: -0.05 },
  { src: "/images/bbq-kabob.svg", rotate: -8, scale: 0.55, jitter: 0.02 },
  { src: "/images/bbq-tomato.svg", rotate: 12, scale: 0.75, jitter: -0.03 },
  { src: "/images/bbq-flame.svg", rotate: -14, flip: true, scale: 0.65, jitter: 0.05 },
  { src: "/images/bbq-tools.svg", rotate: 10, scale: 0.85, jitter: -0.02 },
  { src: "/images/bbq-kabob.svg", rotate: -16, flip: true, scale: 0.5, jitter: 0.03 },
  { src: "/images/bbq-sauce.svg", rotate: 8, scale: 0.75, jitter: -0.04 },
];
const BBQ_EDGE_BOTTOM: BbqIcon[] = [
  { src: "/images/bbq-tools.svg", rotate: -13, flip: true, scale: 1.0, jitter: -0.04 },
  { src: "/images/bbq-flame.svg", rotate: 10, scale: 0.6, jitter: 0.03 },
  { src: "/images/bbq-tomato.svg", rotate: -9, scale: 0.75, jitter: -0.02 },
  { src: "/images/bbq-kabob.svg", rotate: 15, scale: 0.5, jitter: 0.04 },
  { src: "/images/bbq-sauce.svg", rotate: -11, scale: 0.7, jitter: -0.03 },
  { src: "/images/bbq-steak.svg", rotate: 9, scale: 0.85, jitter: 0.02 },
  { src: "/images/bbq-kabob.svg", rotate: -15, flip: true, scale: 0.5, jitter: -0.05 },
  { src: "/images/bbq-grill.svg", rotate: 8, flip: true, scale: 1.1, jitter: 0.04 },
];
const BBQ_EDGE_LEFT: BbqIcon[] = [
  { src: "/images/bbq-kabob.svg", rotate: -10, scale: 0.55, jitter: 0.03 },
  { src: "/images/bbq-tomato.svg", rotate: 13, flip: true, scale: 0.75, jitter: -0.04 },
  { src: "/images/bbq-flame.svg", rotate: -7, scale: 0.65, jitter: 0.03 },
  { src: "/images/bbq-sauce.svg", rotate: 11, scale: 0.7, jitter: -0.03 },
];
const BBQ_EDGE_RIGHT: BbqIcon[] = [
  { src: "/images/bbq-sauce.svg", rotate: 9, scale: 0.8, jitter: -0.03 },
  { src: "/images/bbq-kabob.svg", rotate: -12, flip: true, scale: 0.55, jitter: 0.04 },
  { src: "/images/bbq-tomato.svg", rotate: 6, scale: 0.75, jitter: -0.02 },
  { src: "/images/bbq-flame.svg", rotate: -9, flip: true, scale: 0.65, jitter: 0.03 },
];

// Individually-drawn rects, not an SVG <pattern> tile (and before that, a
// tiled CSS gradient) — both of those get pre-rasterized to a fixed-DPI
// bitmap by Chrome's print/PDF pipeline even though they render crisply
// on screen, which is what actually turned this checkerboard blocky in
// exported PDFs. Plain vector geometry has no tile to rasterize, so it
// stays crisp at any print DPI. 48 bands (0.24in each) comfortably covers
// the tallest card (11in letter); any extra past the real card height is
// clipped by the SVG's own viewport, which is sized to the card by CSS.
const BISTRO_CHECKER_BANDS = 48;

function BistroCheckerSpine() {
  return (
    <div className="recipe-card__checker" aria-hidden>
      <svg width="100%" height="100%" focusable="false">
        {Array.from({ length: BISTRO_CHECKER_BANDS }, (_, band) => {
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

// Shared by RecipeCardFace, DividerFace, and CoverFace so section dividers
// and covers pick up the same cookout border instead of going bare.
// `withPhotoGap` is only relevant on a recipe front face — it pulls the top
// and right strips back so they don't run under the corner photo thumbnail.
function CookoutBbqBorder({ withPhotoGap = false }: { withPhotoGap?: boolean }) {
  return (
    <div
      className={`recipe-card__bbq-border ${withPhotoGap ? "recipe-card__bbq-border--with-photo" : ""}`}
      aria-hidden
    >
      <div className="recipe-card__bbq-edge recipe-card__bbq-edge--top">
        {BBQ_EDGE_TOP.map((icon, i) => (
          <BbqIconImg key={`top-${i}`} iconKey={`top-${i}`} icon={icon} axis="y" />
        ))}
      </div>
      <div className="recipe-card__bbq-edge recipe-card__bbq-edge--bottom">
        {BBQ_EDGE_BOTTOM.map((icon, i) => (
          <BbqIconImg key={`bottom-${i}`} iconKey={`bottom-${i}`} icon={icon} axis="y" />
        ))}
      </div>
      <div className="recipe-card__bbq-edge recipe-card__bbq-edge--left">
        {BBQ_EDGE_LEFT.map((icon, i) => (
          <BbqIconImg key={`left-${i}`} iconKey={`left-${i}`} icon={icon} axis="x" />
        ))}
      </div>
      <div className="recipe-card__bbq-edge recipe-card__bbq-edge--right">
        {BBQ_EDGE_RIGHT.map((icon, i) => (
          <BbqIconImg key={`right-${i}`} iconKey={`right-${i}`} icon={icon} axis="x" />
        ))}
      </div>
    </div>
  );
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
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [recipe.image]);
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
    // Mounting a permanent <input> here — even one whose box is pixel-
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
        {addLine("ingredient", index + 1)}
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
        {addLine("step", index + 1)}
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
      {template === "bistro" && <BistroCheckerSpine />}
      {template === "cookout" && !continued && <CookoutBbqBorder withPhotoGap={showPhoto} />}

      {showHeader ? (
        <header
          className={`recipe-card__header ${
            showPhoto ? "recipe-card__header--with-photo" : ""
          }`}
        >
          <div className="recipe-card__headline">
            {canEdit && inlineEdit ? (
              <input
                autoFocus
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
                <span className="recipe-card__continued-inline"> (continued on back)</span>
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

export interface DividerCardInlineEdit {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// A section divider is always exactly one physical page — no ingredients/
// instructions budget to split — so unlike RecipeCardFace's title/ingredient/
// step fields there's just the one editable field. Same technique as the
// recipe title, though: the `<input>` shares its typography class with the
// `<h1>` it replaces (plus the shared `.recipe-card__inline-input` reset, see
// its comment in globals.css) so the box is pixel-identical — editing swaps
// the element, not the layout.
export const DividerFace = memo(function DividerFace({
  title,
  recipeTitles = [],
  previewHidden = false,
  inlineEdit,
  template,
}: {
  title: string;
  recipeTitles?: string[];
  previewHidden?: boolean;
  inlineEdit?: DividerCardInlineEdit;
  template?: RecipePrintTemplate;
}) {
  const recipeCount = recipeTitles.length;

  return (
    <article
      className="recipe-card recipe-card--divider"
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__accent" aria-hidden />
      {template === "bistro" && <BistroCheckerSpine />}
      {template === "cookout" && <CookoutBbqBorder />}
      <div className="recipe-card__divider-content">
        <p className="recipe-card__divider-kicker">Section</p>
        {inlineEdit ? (
          <input
            autoFocus
            className="recipe-card__inline-input recipe-card__divider-title"
            value={inlineEdit.value}
            aria-label="Section title"
            onChange={(event) => inlineEdit.onChange(event.target.value)}
            onBlur={inlineEdit.onCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") inlineEdit.onCancel();
            }}
          />
        ) : (
          <h1 className="recipe-card__divider-title">{title}</h1>
        )}
        {recipeCount > 0 && (
          <div className="recipe-card__divider-recipes" aria-label="Recipes in this section">
            <p className="recipe-card__divider-count">
              {recipeCount} recipe{recipeCount === 1 ? "" : "s"}
            </p>
            <ol className="recipe-card__divider-recipe-list">
              {recipeTitles.slice(0, 8).map((recipeTitle, index) => (
                <li key={`${recipeTitle}-${index}`}>{recipeTitle}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </article>
  );
});

export interface CoverCardInlineEdit {
  cover: CoverConfig;
  onChange: (cover: CoverConfig) => void;
}

export const CoverFace = memo(function CoverFace({ cover, side, previewHidden = false, inlineEdit }: {
  cover: CoverConfig;
  side: "front" | "back";
  previewHidden?: boolean;
  inlineEdit?: CoverCardInlineEdit;
}) {
  const canEdit = Boolean(inlineEdit);
  const draft = inlineEdit?.cover ?? cover;

  function set(patch: Partial<CoverConfig>) {
    inlineEdit?.onChange({ ...draft, ...patch });
  }

  return (
    <article
      className={`recipe-card recipe-card--cover recipe-card--cover-${side}`}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__accent" aria-hidden />
      {draft.template === "bistro" && <BistroCheckerSpine />}
      {draft.template === "cookout" && <CookoutBbqBorder />}
      {draft.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.imageUrl} alt="" className="recipe-card__cover-image" />
      )}
      <div className="recipe-card__cover-content">
        {side === "front" &&
          (canEdit ? (
            <input
              autoFocus
              className="recipe-card__inline-input recipe-card__cover-title"
              value={draft.title}
              placeholder="Cover title"
              aria-label="Cover title"
              onChange={(event) => set({ title: event.target.value })}
            />
          ) : (
            draft.title && <h1 className="recipe-card__cover-title">{draft.title}</h1>
          ))}
        {side === "front" &&
          (canEdit ? (
            <input
              className="recipe-card__inline-input recipe-card__cover-subtitle"
              value={draft.subtitle ?? ""}
              placeholder="Subtitle"
              aria-label="Cover subtitle"
              onChange={(event) => set({ subtitle: event.target.value || undefined })}
            />
          ) : (
            draft.subtitle && <p className="recipe-card__cover-subtitle">{draft.subtitle}</p>
          ))}
        {side === "front" &&
          (canEdit ? (
            <input
              className="recipe-card__inline-input recipe-card__cover-author"
              value={draft.author ?? ""}
              placeholder="Author"
              aria-label="Cover author"
              onChange={(event) => set({ author: event.target.value || undefined })}
            />
          ) : (
            draft.author && <p className="recipe-card__cover-author">{draft.author}</p>
          ))}
      </div>
    </article>
  );
});
