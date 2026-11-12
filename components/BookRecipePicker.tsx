"use client";

import { useMemo, useState } from "react";
import { filterImportSummaries, importSearchText, type ImportSummary } from "@/lib/importSummary";
import { ingredientText } from "@/lib/recipeCardLayout";
import { selectableQueueIds, toggleSelection } from "@/lib/importSelection";
import type { QueueItem } from "@/types/recipe";
import { RecipeSourceList } from "@/components/import/RecipeSourceList";
import { BookIcon } from "@/components/icons";

/** A recipe already in the book, and the chapter it sits in now. */
export interface BookRecipe {
  item: QueueItem;
  /** Blank when it is in no named chapter. */
  chapterTitle: string;
}

/**
 * "From this book": the recipes a cookbook already holds, to put in a chapter.
 *
 * Dragging was the only way into a chapter, and in a book of sixty recipes the
 * one you want is rarely on screen beside the chapter you want it in. This is
 * the same searchable list the recipe apps use, over the book itself. Ticking
 * is local; the dialog's button moves what is ticked, all at once.
 */
export function BookRecipePicker({
  recipes,
  selectedIds,
  onSelectedIdsChange,
}: {
  /** Every recipe that is NOT already in the target chapter. */
  recipes: BookRecipe[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
}) {
  const [queryText, setQueryText] = useState("");
  const rows = useMemo<ImportSummary[]>(
    () =>
      recipes.map(({ item, chapterTitle }) => {
        const recipe = item.recipe;
        return {
          id: item.id,
          queueId: item.id,
          title: recipe?.title || item.title || "Untitled recipe",
          imageURL: recipe?.image,
          // Searchable by the chapter it is in now, so "desserts" finds the
          // ones to move out of Desserts.
          searchText: importSearchText(
            recipe?.title || item.title,
            chapterTitle,
            recipe?.sourceName,
            ...(recipe?.tags ?? []),
            ...(recipe?.ingredients ?? []).map(ingredientText),
          ),
        };
      }),
    [recipes],
  );
  const visibleRows = useMemo(() => filterImportSummaries(rows, queryText), [rows, queryText]);
  const noneAdded = useMemo(() => new Set<string>(), []);
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.queueId));

  return (
    <RecipeSourceList
      heading="In this book"
      countLabel={`(${rows.length})`}
      summaries={visibleRows}
      showMeta={false}
      addedIds={noneAdded}
      selectedIds={selectedIds}
      allSelectableSelected={allVisibleSelected}
      onToggle={(row) => onSelectedIdsChange(toggleSelection(selectedIds, row.queueId))}
      onToggleAll={() => {
        const visible = new Set(visibleRows.map((row) => row.queueId));
        if (allVisibleSelected) {
          onSelectedIdsChange(new Set(Array.from(selectedIds).filter((id) => !visible.has(id))));
          return;
        }
        onSelectedIdsChange(
          new Set(Array.from(selectedIds).concat(selectableQueueIds(visibleRows, noneAdded))),
        );
      }}
      // The dialog's own button moves the selection.
      onCommit={() => {}}
      commitLabel=""
      hideCommit
      queryText={queryText}
      onQueryChange={setQueryText}
      searchId="book-recipe-search"
      searchLabel="Search the recipes in this book"
      fallbackIcon={BookIcon}
    />
  );
}
