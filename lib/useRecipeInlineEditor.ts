"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { printableRecipe, updateQueuedRecipe } from "@/lib/queue";
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
  setItems: Dispatch<SetStateAction<QueueItem[] | null>>;
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
  setItems,
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

  const commitEditTarget = useCallback(
    (value = editValue) => {
      if (!editingEdit || !editingRecipeItem?.recipe) return;
      const target = editingEdit.target;
      const nextRecipe = applyRecipeTargetEdit(editingRecipeItem.recipe, target, value);
      updateQueuedRecipe(editingRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) =>
          item.id === editingRecipeItem.id
            ? { ...item, recipe: nextRecipe, title: nextRecipe.title || "Untitled recipe" }
          : item,
        ) ?? current,
      );
      setEditingEdit(null);
      setEditValue("");
    },
    [editValue, editingEdit, editingRecipeItem, setItems],
  );

  const changeRecipeImage = useCallback(
    (url: string) => {
      if (!activeRecipeItem?.recipe) return;
      const nextRecipe = applyRecipeTargetEdit(activeRecipeItem.recipe, { kind: "image" }, url);
      updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) =>
          item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item,
        ) ?? current,
      );
    },
    [activeRecipeItem, setItems],
  );

  const insertIngredientAt = useCallback(
    (index: number) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe = activeRecipeItem.recipe;
      const section = sectionForInsertion(recipe.ingredients, index);
      const ingredients = recipe.ingredients.slice();
      ingredients.splice(index, 0, { raw: "", name: "", section });
      const nextRecipe = printableRecipe({ ...recipe, ingredients });
      updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
          current,
      );
      setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "ingredient", index } });
      setEditValue("");
    },
    [activeRecipeItem, setItems],
  );

  const insertStepAt = useCallback(
    (index: number) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe = activeRecipeItem.recipe;
      const section = sectionForInsertion(recipe.instructions, index);
      const instructions = recipe.instructions.slice();
      instructions.splice(index, 0, { step: 0, text: "", section });
      const renumbered = instructions.map((step, i) => ({ ...step, step: i + 1 }));
      const nextRecipe = printableRecipe({ ...recipe, instructions: renumbered });
      updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
          current,
      );
      setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "step", index } });
      setEditValue("");
    },
    [activeRecipeItem, setItems],
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
        updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
        setItems((current) =>
          current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
            current,
        );
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
        updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
        setItems((current) =>
          current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
            current,
        );
        setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "step", index: target.index + 1 } });
        setEditValue(after);
      }
    },
    [activeRecipeItem, setItems],
  );

  // Only the currently-active recipe's card ever receives a real inlineEdit
  // object (every other card gets undefined), so this is computed once here
  // rather than freshly per nav item in the render below — keeps the object
  // reference stable across unrelated re-renders, which lets RecipeCardFace's
  // memo() actually skip work instead of re-rendering the active card on
  // every keystroke and every unrelated state change on this page.
  const activeInlineEdit = useMemo<RecipeCardInlineEdit | undefined>(() => {
    if (!pageEditMode || !activeRecipeItem) return undefined;
    return {
      editingTarget: editingEdit?.recipeId === activeRecipeItem.id ? editingEdit.target : null,
      value: editValue,
      onFocusTarget: startEditTarget,
      onValueChange: setEditValue,
      onCommit: commitEditTarget,
      onImageChange: changeRecipeImage,
      onCancel: cancelEditTarget,
      onInsertIngredient: insertIngredientAt,
      onInsertStep: insertStepAt,
      onSplitLine: splitEditLine,
    };
  }, [
    pageEditMode,
    activeRecipeItem,
    editingEdit,
    editValue,
    startEditTarget,
    commitEditTarget,
    changeRecipeImage,
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

  function togglePageEditMode() {
    if (pageEditMode && editingEdit) {
      // Unmounting a focused field on toggle-off isn't guaranteed to fire a
      // blur event in every browser, so commit explicitly before hiding it.
      commitEditTarget(editValue);
    }
    setPageEditMode((mode) => !mode);
  }

  return { pageEditMode, togglePageEditMode, activeInlineEdit };
}
