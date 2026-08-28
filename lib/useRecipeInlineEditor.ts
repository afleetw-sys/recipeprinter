"use client";

import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { printableRecipe } from "@/lib/queue";
import { ingredientText } from "@/lib/recipeCardLayout";
import type { RecipeCardEditTarget, RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { QueueItem, Recipe } from "@/types/recipe";

interface RecipeEditSelection {
  recipeId: string;
  target: RecipeCardEditTarget;
}

function stripStepPrefix(value: string): string {
  return value
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[\).:-]\s*/, "")
    .trim();
}

// Section headers group consecutive ingredients/steps that share a `section`
// value (see `sectionGroups` in RecipeCardPrint). Renaming one only touches
// that consecutive run, starting at the group's first item, so a later group
// that happens to reuse the same title text is left alone.
function applySectionTitleEdit<T extends { section?: string }>(
  items: T[],
  startIndex: number,
  newTitle: string,
): T[] {
  const originalTitle = items[startIndex]?.section?.trim() || undefined;
  const trimmedNewTitle = newTitle.trim() || undefined;
  const next = items.slice();
  for (let i = startIndex; i < next.length; i++) {
    const itemTitle = next[i].section?.trim() || undefined;
    if (itemTitle !== originalTitle) break;
    next[i] = { ...next[i], section: trimmedNewTitle };
  }
  return next;
}

/**
 * Turn a row into a section heading, or a heading back into a row.
 *
 * Sections are not objects: a group is a run of consecutive items sharing the
 * same `section` string (see `sectionGroups`). So "make this line a heading"
 * means removing the line and stamping its text onto the run that followed it,
 * and "make this heading a line" means clearing that run and putting the words
 * back as an ordinary item.
 */
export function promoteLineToSection<T extends { section?: string }>(items: T[], index: number, title: string): T[] {
  const original = items[index]?.section?.trim() || undefined;
  const next = items.slice();
  next.splice(index, 1);
  for (let i = index; i < next.length; i++) {
    if ((next[i].section?.trim() || undefined) !== original) break;
    next[i] = { ...next[i], section: title };
  }
  return next;
}

export function demoteSectionToLine<T extends { section?: string }>(
  items: T[],
  index: number,
  makeItem: (text: string, section: string | undefined) => T,
): { items: T[]; title: string } {
  const title = items[index]?.section?.trim() ?? "";
  const original = items[index]?.section?.trim() || undefined;
  const next = items.slice();
  for (let i = index; i < next.length; i++) {
    if ((next[i].section?.trim() || undefined) !== original) break;
    next[i] = { ...next[i], section: items[index - 1]?.section };
  }
  next.splice(index, 0, makeItem(title, items[index - 1]?.section));
  return { items: next, title };
}

function applyRecipeTargetEdit(recipe: Recipe, target: RecipeCardEditTarget, value: string): Recipe {
  const trimmed = value.trim();
  if (target.kind === "title") {
    return printableRecipe({ ...recipe, title: trimmed || recipe.title || "Untitled recipe" });
  }
  if (target.kind === "description") {
    return printableRecipe({ ...recipe, description: trimmed || undefined });
  }
  if (target.kind === "cookTime") {
    return printableRecipe({
      ...recipe,
      cookTime: trimmed || undefined,
      totalTime: trimmed || undefined,
    });
  }
  if (target.kind === "servings") {
    return printableRecipe({
      ...recipe,
      servings: trimmed || undefined,
    });
  }
  if (target.kind === "image") {
    return printableRecipe({
      ...recipe,
      image: trimmed || undefined,
    });
  }
  if (target.kind === "sourceUrl") {
    return printableRecipe({
      ...recipe,
      sourceUrl: trimmed || undefined,
    });
  }
  if (target.kind === "ingredient") {
    if (!trimmed) {
      return printableRecipe({
        ...recipe,
        ingredients: recipe.ingredients.filter((_, index) => index !== target.index),
      });
    }
    return printableRecipe({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient, index) =>
        index === target.index
          ? {
              ...ingredient,
              amount: undefined,
              unit: undefined,
              name: trimmed,
              note: undefined,
              raw: trimmed,
            }
          : ingredient,
      ),
    });
  }
  if (target.kind === "ingredientSection") {
    return printableRecipe({
      ...recipe,
      ingredients: applySectionTitleEdit(recipe.ingredients, target.index, trimmed),
    });
  }
  if (target.kind === "instructionSection") {
    return printableRecipe({
      ...recipe,
      instructions: applySectionTitleEdit(recipe.instructions, target.index, trimmed),
    });
  }
  const text = stripStepPrefix(trimmed);
  if (!text) {
    return printableRecipe({
      ...recipe,
      instructions: recipe.instructions
        .filter((_, index) => index !== target.index)
        .map((step, index) => ({ ...step, step: index + 1 })),
    });
  }
  return printableRecipe({
    ...recipe,
    instructions: recipe.instructions.map((step, index) =>
      index === target.index ? { ...step, text } : step,
    ),
  });
}

// The new line inherits whichever section the item at (or just before,
// for an append at the end) that index belongs to, so inserting in the
// middle of a "For the sauce" group doesn't fork off an unlabeled group.
function sectionForInsertion<T extends { section?: string }>(items: T[], index: number): string | undefined {
  return items[index]?.section ?? items[index - 1]?.section;
}

interface UseRecipeInlineEditorOptions {
  items: QueueItem[] | null;
  /** Writes the edit into the queue hook's React state + storage — the single
      content owner. The deck re-derives from the queue, so there is no separate
      page copy to update here. */
  updateRecipe: (id: string, recipe: Recipe) => void;
  activeRecipeId: string | null;
  activeRecipeItem: QueueItem | null | undefined;
  /** What a change of "which page you're on" is keyed to for the leave-edit-mode
      reset. Defaults to `activeRecipeId`. On a half sheet the active recipe can
      switch between the two cards without leaving the page, so the page passes a
      per-SHEET key here — switching cards then keeps edit mode on. */
  resetKey?: string | null;
  /** When a recipe is intentionally moved (e.g. its photo placement changed, so
      it lands on a different page), the page stashes that recipe id here so the
      leave-edit-mode reset skips ONCE as focus follows it to the new page —
      keeping the recipe both selected and still in edit mode. Consumed on use. */
  keepEditingRef?: MutableRefObject<string | null>;
}

/**
 * Owns the print page's inline-edit mode: which field (if any) is focused,
 * its in-progress value, and the six operations RecipeCardFace's inline
 * editing UI drives (focus/commit/cancel a field, insert a new
 * ingredient/step, split a line at the cursor on Enter). Returns just the
 * three things the page needs to render around it — `pageEditMode` for the
 * Edit/Done toggle, `togglePageEditMode` for that button, and
 * `activeInlineEdit` (stable across unrelated re-renders — see its own
 * comment) to hand to the currently-active card.
 */
export function useRecipeInlineEditor({
  items,
  updateRecipe,
  activeRecipeId,
  activeRecipeItem,
  resetKey,
  keepEditingRef,
}: UseRecipeInlineEditorOptions) {
  const [pageEditMode, setPageEditMode] = useState(false);
  const [editingEdit, setEditingEdit] = useState<RecipeEditSelection | null>(null);
  const [editValue, setEditValue] = useState("");

  const editingRecipeItem =
    editingEdit?.recipeId && items
      ? items.find((item) => item.id === editingEdit.recipeId && item.recipe)
      : null;

  const startEditTarget = useCallback(
    (target: RecipeCardEditTarget, value: string) => {
      if (!activeRecipeItem?.recipe) return;
      setEditingEdit({ recipeId: activeRecipeItem.id, target });
      setEditValue(value);
    },
    [activeRecipeItem],
  );

  const cancelEditTarget = useCallback(() => {
    setEditingEdit(null);
    setEditValue("");
  }, []);

  // Route every edit through the queue hook, the single content owner: it
  // updates its React `items` (which the deck derives from) and storage
  // together, so there is no separate page copy to keep in step here.
  const applyRecipeUpdate = useCallback(
    (id: string, nextRecipe: Recipe) => {
      updateRecipe(id, nextRecipe);
    },
    [updateRecipe],
  );

  const commitEditTarget = useCallback(
    (value = editValue) => {
      if (!editingEdit || !editingRecipeItem?.recipe) return;
      const target = editingEdit.target;
      const nextRecipe = applyRecipeTargetEdit(editingRecipeItem.recipe, target, value);
      applyRecipeUpdate(editingRecipeItem.id, nextRecipe);
      setEditingEdit(null);
      setEditValue("");
    },
    [editValue, editingEdit, editingRecipeItem, applyRecipeUpdate],
  );

  const changeRecipeImage = useCallback(
    (url: string) => {
      if (!activeRecipeItem?.recipe) return;
      const nextRecipe = applyRecipeTargetEdit(activeRecipeItem.recipe, { kind: "image" }, url);
      applyRecipeUpdate(activeRecipeItem.id, nextRecipe);
    },
    [activeRecipeItem, applyRecipeUpdate],
  );

  /**
   * The body/heading switch on the field being edited.
   *
   * Reads the in-progress text rather than the committed value: the toolbar
   * click blurs the field a beat before it fires, so building from the live
   * edit is what stops "Butter, softened" becoming a heading called whatever
   * the row said before this keystroke.
   */
  const setLineKind = useCallback(
    (target: RecipeCardEditTarget, kind: "body" | "heading") => {
      if (!activeRecipeItem?.recipe) return;
      const recipe =
        editingEdit?.recipeId === activeRecipeItem.id
          ? applyRecipeTargetEdit(activeRecipeItem.recipe, editingEdit.target, editValue)
          : activeRecipeItem.recipe;

      if (kind === "heading" && (target.kind === "ingredient" || target.kind === "step")) {
        const list = target.kind === "ingredient" ? recipe.ingredients : recipe.instructions;
        const source = list[target.index];
        if (!source) return;
        const title =
          target.kind === "ingredient"
            ? ingredientText(recipe.ingredients[target.index])
            : recipe.instructions[target.index]?.text ?? "";
        if (!title.trim()) return;
        const next =
          target.kind === "ingredient"
            ? { ...recipe, ingredients: promoteLineToSection(recipe.ingredients, target.index, title.trim()) }
            : { ...recipe, instructions: promoteLineToSection(recipe.instructions, target.index, title.trim()) };
        applyRecipeUpdate(activeRecipeItem.id, printableRecipe(next));
        setEditingEdit({
          recipeId: activeRecipeItem.id,
          target: {
            kind: target.kind === "ingredient" ? "ingredientSection" : "instructionSection",
            index: target.index,
          },
        });
        setEditValue(title.trim());
        return;
      }

      if (
        kind === "body" &&
        (target.kind === "ingredientSection" || target.kind === "instructionSection")
      ) {
        if (target.kind === "ingredientSection") {
          const { items: ingredients, title } = demoteSectionToLine(
            recipe.ingredients,
            target.index,
            (text, section) => ({ raw: text, name: text, section }),
          );
          applyRecipeUpdate(activeRecipeItem.id, printableRecipe({ ...recipe, ingredients }));
          setEditingEdit({
            recipeId: activeRecipeItem.id,
            target: { kind: "ingredient", index: target.index },
          });
          setEditValue(title);
          return;
        }
        const { items: instructions, title } = demoteSectionToLine(
          recipe.instructions,
          target.index,
          (text, section) => ({ step: 0, text, section }),
        );
        applyRecipeUpdate(activeRecipeItem.id, printableRecipe({ ...recipe, instructions }));
        setEditingEdit({
          recipeId: activeRecipeItem.id,
          target: { kind: "step", index: target.index },
        });
        setEditValue(title);
      }
    },
    [activeRecipeItem, editingEdit, editValue, applyRecipeUpdate],
  );

  const insertIngredientAt = useCallback(
    (index: number) => {
      if (!activeRecipeItem?.recipe) return;
      // Clicking Add blurs the current field just before the click fires. Build
      // from that in-progress edit directly so the blur/save and insertion can
      // never race and recreate the preceding row.
      const recipe =
        editingEdit?.recipeId === activeRecipeItem.id
          ? applyRecipeTargetEdit(activeRecipeItem.recipe, editingEdit.target, editValue)
          : activeRecipeItem.recipe;
      const section = sectionForInsertion(recipe.ingredients, index);
      const ingredients = recipe.ingredients.slice();
      ingredients.splice(index, 0, { raw: "", name: "", section });
      const nextRecipe = printableRecipe({ ...recipe, ingredients });
      applyRecipeUpdate(activeRecipeItem.id, nextRecipe);
      setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "ingredient", index } });
      setEditValue("");
    },
    [activeRecipeItem, editValue, editingEdit, applyRecipeUpdate],
  );

  const insertStepAt = useCallback(
    (index: number) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe =
        editingEdit?.recipeId === activeRecipeItem.id
          ? applyRecipeTargetEdit(activeRecipeItem.recipe, editingEdit.target, editValue)
          : activeRecipeItem.recipe;
      const section = sectionForInsertion(recipe.instructions, index);
      const instructions = recipe.instructions.slice();
      instructions.splice(index, 0, { step: 0, text: "", section });
      const renumbered = instructions.map((step, i) => ({ ...step, step: i + 1 }));
      const nextRecipe = printableRecipe({ ...recipe, instructions: renumbered });
      applyRecipeUpdate(activeRecipeItem.id, nextRecipe);
      setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "step", index } });
      setEditValue("");
    },
    [activeRecipeItem, editValue, editingEdit, applyRecipeUpdate],
  );

  // Enter mid-ingredient/mid-step splits the line at the cursor: the text
  // before the cursor stays put, the text after becomes a new line right
  // below it (focused, ready to keep typing) — like hitting Enter in any
  // text editor, rather than committing the whole field.
  const splitEditLine = useCallback(
    (target: RecipeCardEditTarget, before: string, after: string) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe = activeRecipeItem.recipe;
      if (target.kind === "ingredient") {
        const ingredients = recipe.ingredients.slice();
        ingredients[target.index] = {
          ...ingredients[target.index],
          amount: undefined,
          unit: undefined,
          name: before,
          note: undefined,
          raw: before,
        };
        const section = sectionForInsertion(ingredients, target.index + 1);
        ingredients.splice(target.index + 1, 0, { raw: after, name: after, section });
        const nextRecipe = printableRecipe({ ...recipe, ingredients });
        applyRecipeUpdate(activeRecipeItem.id, nextRecipe);
        setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "ingredient", index: target.index + 1 } });
        setEditValue(after);
        return;
      }
      if (target.kind === "step") {
        const instructions = recipe.instructions.slice();
        instructions[target.index] = { ...instructions[target.index], text: before };
        const section = sectionForInsertion(instructions, target.index + 1);
        instructions.splice(target.index + 1, 0, { step: 0, text: after, section });
        const renumbered = instructions.map((step, i) => ({ ...step, step: i + 1 }));
        const nextRecipe = printableRecipe({ ...recipe, instructions: renumbered });
        applyRecipeUpdate(activeRecipeItem.id, nextRecipe);
        setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "step", index: target.index + 1 } });
        setEditValue(after);
      }
    },
    [activeRecipeItem, applyRecipeUpdate],
  );

  // Only the currently-active recipe's card ever receives a real inlineEdit
  // object (every other card gets undefined), so this is computed once here
  // rather than freshly per nav item in the render below — keeps the object
  // reference stable across unrelated re-renders, which lets RecipeCardFace's
  // memo() actually skip work instead of re-rendering the active card on
  // every keystroke and every unrelated state change on this page.
  const activeInlineEdit = useMemo<RecipeCardInlineEdit | undefined>(() => {
    // No longer gated on a mode. Text that is ALREADY on the card is editable
    // by clicking it, because the inline editors are a full visual reset
    // (`font: inherit`, no box, no outline until focus) -- a live field and the
    // text it replaces are the same pixels. What still needs a mode is the
    // empty half: a recipe with no note has zero height where the note would
    // go, and there is no way to hover something that is not there. That is
    // `showEmptyFields`, passed to the card separately.
    if (!activeRecipeItem) return undefined;
    return {
      editingTarget: editingEdit?.recipeId === activeRecipeItem.id ? editingEdit.target : null,
      value: editValue,
      onFocusTarget: startEditTarget,
      onValueChange: setEditValue,
      onCommit: commitEditTarget,
      onImageChange: changeRecipeImage,
      onSetLineKind: setLineKind,
      onCancel: cancelEditTarget,
      onInsertIngredient: insertIngredientAt,
      onInsertStep: insertStepAt,
      onSplitLine: splitEditLine,
    };
  }, [
    activeRecipeItem,
    editingEdit,
    editValue,
    startEditTarget,
    commitEditTarget,
    changeRecipeImage,
    setLineKind,
    cancelEditTarget,
    insertIngredientAt,
    insertStepAt,
    splitEditLine,
  ]);

  useEffect(() => {
    const hasEditing = editingEdit
      ? items?.some((item) => item.id === editingEdit.recipeId && item.recipe)
      : true;
    if (!hasEditing) {
      setEditingEdit(null);
      setEditValue("");
    }
  }, [editingEdit, items]);

  // Editing is opt-in per page: leaving edit mode active while flipping to a
  // different page in the deck would carry stray editing/placeholder state onto
  // a recipe the user never asked to edit. Keyed to `resetKey` (the page), not
  // the active recipe, so switching between the two cards of one half sheet
  // keeps edit mode on. Falls back to `activeRecipeId` when unset.
  const resetOn = resetKey ?? activeRecipeId;
  useEffect(() => {
    // A recipe we deliberately moved (placement change) is following focus to
    // its new page — skip the reset once so it stays selected AND in edit mode.
    if (keepEditingRef?.current && keepEditingRef.current === activeRecipeId) {
      keepEditingRef.current = null;
      return;
    }
    setPageEditMode(false);
    setEditingEdit(null);
    setEditValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetOn]);

  function toggleShowEmptyFields() {
    if (pageEditMode && editingEdit) {
      // A field being hidden by the toggle isn't guaranteed to fire a blur in
      // every browser, so commit explicitly before it goes.
      commitEditTarget(editValue);
    }
    setPageEditMode((mode) => !mode);
  }

  return { showEmptyFields: pageEditMode, toggleShowEmptyFields, activeInlineEdit };
}
