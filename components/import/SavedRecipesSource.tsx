"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PrintProject, QueueItem } from "@/types/recipe";
import { filterImportSummaries, importSearchText, type ImportSummary } from "@/lib/importSummary";
import { ingredientText } from "@/lib/recipeCardLayout";
import { allSelectableSelected as allSelectableSelectedIn, selectableQueueIds, toggleSelection } from "@/lib/importSelection";
import { isBookPage } from "@/lib/bookPages";
import { recipeToShare } from "@/lib/linkedRecipes";
import { projectListTitle } from "@/lib/projectLibrary";
import { uid as newId } from "@/lib/ids";
import { RecipeSourceList, type LibraryCommitRef } from "@/components/import/RecipeSourceList";
import { BookIcon } from "@/components/icons";

/**
 * "Your recipes": the recipes already in the cook's other saved projects, to
 * use here without importing them again.
 *
 * A recipe added from here is LINKED, not copied: it is the same recipe in both
 * places, and an edit in either reaches the other (lib/linkedRecipes). That is
 * what makes it different from importing the same link twice.
 *
 * Only /print offers it, and only signed in, by providing this context around
 * the Add dialog. Everything else about the dialog is unchanged.
 */
export interface SavedRecipesSourceConfig {
  uid: string;
  /** The project being added to, left out of the list. */
  currentProjectId: string;
  /** Adds the linked copies. Free accounts may pick several here: they are
      previewed, and printing more than one is what asks for Pro. */
  onAdd: (items: QueueItem[]) => number;
}

export const SavedRecipesContext = createContext<SavedRecipesSourceConfig | null>(null);

export function useSavedRecipesSource(): SavedRecipesSourceConfig | null {
  return useContext(SavedRecipesContext);
}

interface Row extends ImportSummary {
  project: PrintProject;
  item: QueueItem;
}

/** The record a recipe in another project shares through, or would. */
function recordIdOf(project: PrintProject, item: QueueItem): string {
  return item.link?.id ?? `${project.id}_${item.id}`.replace(/\//g, "_");
}

/** A few projects at a time: a cook with many books isn't one burst of reads. */
async function loadProjects(uid: string, ids: string[]): Promise<PrintProject[]> {
  const { loadPrintProject } = await import("@/lib/printProjects");
  const out: PrintProject[] = [];
  for (let index = 0; index < ids.length; index += 4) {
    const batch = await Promise.all(
      ids.slice(index, index + 4).map((id) => loadPrintProject(uid, id).catch(() => null)),
    );
    batch.forEach((project) => project && out.push(project));
  }
  return out;
}

export function SavedRecipesSource({
  config,
  items,
  commitLabel,
  commitRef,
}: {
  config: SavedRecipesSourceConfig;
  items: QueueItem[];
  commitLabel: string;
  commitRef?: LibraryCommitRef;
}) {
  const [projects, setProjects] = useState<PrintProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { loadPrintProjectSummaries } = await import("@/lib/printProjects");
        const summaries = await loadPrintProjectSummaries(config.uid);
        const ids = summaries.filter((summary) => summary.id !== config.currentProjectId).map((summary) => summary.id);
        const loaded = await loadProjects(config.uid, ids);
        if (live) setProjects(loaded);
      } catch {
        if (live) setError("We couldn't load your projects. Please try again.");
      }
    })();
    return () => {
      live = false;
    };
  }, [config.uid, config.currentProjectId]);

  // One row per recipe, however many projects it is in: a recipe linked into
  // a book and its cards is one recipe, listed once.
  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const project of projects ?? []) {
      const projectName = projectListTitle(project);
      for (const section of project.sections ?? []) {
        for (const item of section.items ?? []) {
          if (!item.recipe || item.status !== "ready" || isBookPage(item)) continue;
          const recordId = recordIdOf(project, item);
          if (seen.has(recordId)) continue;
          seen.add(recordId);
          const recipe = item.recipe;
          out.push({
            id: recordId,
            queueId: recordId,
            title: recipe.title || item.title || "Untitled recipe",
            imageURL: recipe.image || undefined,
            searchText: importSearchText(
              recipe.title || item.title,
              projectName,
              recipe.sourceName,
              ...(recipe.tags ?? []),
              ...(recipe.ingredients ?? []).map(ingredientText),
            ),
            project,
            item,
          });
        }
      }
    }
    return out;
  }, [projects]);

  // A recipe already linked into this project is in, and can't be added twice.
  const addedIds = useMemo(
    () => new Set(items.flatMap((item) => (item.link ? [item.link.id] : []))),
    [items],
  );
  const visibleRows = useMemo(() => filterImportSummaries(rows, queryText), [rows, queryText]);
  const allVisibleSelected = allSelectableSelectedIn(visibleRows, addedIds, selectedIds);

  async function handleCommit(): Promise<boolean> {
    if (committing) return false;
    const chosen = rows.filter((row) => selectedIds.has(row.queueId) && !addedIds.has(row.queueId));
    if (chosen.length === 0) return true;
    setCommitting(true);
    setError(null);
    try {
      const { shareRecipe } = await import("@/lib/linkedRecipeStore");
      const copies = await Promise.all(
        chosen.map(async ({ project, item }) => {
          const ownPhotosOnly = Boolean(project.settings?.cookbookMode && project.settings?.ownPhotosOnly);
          const shared = recipeToShare(item.recipe!, project.itemPlacements?.[item.id], ownPhotosOnly);
          const { recipe, link } = await shareRecipe(config.uid, {
            projectId: project.id,
            member: true,
            itemId: item.id,
            recipe: item.recipe!,
            shared,
            link: item.link,
          });
          const copy: QueueItem = {
            id: newId(),
            method: item.method,
            source: item.source,
            originalUrl: item.originalUrl,
            status: "ready",
            title: recipe.title || item.title,
            recipe,
            link,
            addedAt: Date.now(),
          };
          return copy;
        }),
      );
      config.onAdd(copies);
      setSelectedIds(new Set());
      return true;
    } catch {
      setError("We couldn't add those recipes. Please try again.");
      return false;
    } finally {
      setCommitting(false);
    }
  }

  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = handleCommit;
    return () => {
      commitRef.current = null;
    };
  });

  return (
    <RecipeSourceList
      heading="Your recipes"
      countLabel={projects ? `(${rows.length})` : undefined}
      summaries={visibleRows}
      showMeta={false}
      addedIds={addedIds}
      selectedIds={selectedIds}
      allSelectableSelected={allVisibleSelected}
      onToggle={(row) => {
        if (addedIds.has(row.queueId)) return;
        setSelectedIds((current) => toggleSelection(current, row.queueId));
      }}
      onToggleAll={() => {
        if (allVisibleSelected) {
          const visible = new Set(visibleRows.map((row) => row.queueId));
          setSelectedIds((current) => new Set(Array.from(current).filter((id) => !visible.has(id))));
          return;
        }
        setSelectedIds((current) => new Set(Array.from(current).concat(selectableQueueIds(visibleRows, addedIds))));
      }}
      onCommit={() => void handleCommit()}
      commitLabel={commitLabel}
      hideCommit={Boolean(commitRef)}
      committing={committing}
      queryText={queryText}
      onQueryChange={setQueryText}
      searchId="saved-recipe-search"
      searchLabel="Search your recipes"
      loading={projects === null && !error}
      loadingLabel="Loading your recipes…"
      error={error}
      emptyState={
        <p className="text-cp-caption text-ink-soft">
          Recipes in your other saved cookbooks and recipe cards show up here.
        </p>
      }
      fallbackIcon={BookIcon}
    />
  );
}
