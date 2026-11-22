"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem, Recipe } from "@/types/recipe";
import { applyRemoteFields, hasLocalChanges, type FieldConflict } from "@/lib/linkedRecipes";
import { rebaseRecipeFields, withoutHistory } from "@/lib/editHistory";
import { projectListTitle } from "@/lib/projectLibrary";

/** How long typing pauses before an edit to a linked recipe is written out.
    Matches the project autosave's own debounce. */
const SYNC_DEBOUNCE_MS = 1500;

export interface LinkedConflict {
  itemId: string;
  title: string;
  conflicts: FieldConflict[];
}

/**
 * The /print end of linked recipes (lib/linkedRecipes, lib/linkedRecipeStore).
 *
 * Runs a reconcile when the project opens, when the tab comes back into view
 * (the other project may have been edited in another tab), when it is hidden
 * (so an edit still inside the debounce is not left behind), and shortly after
 * an edit to a linked recipe. No live listener: Safari holds `print()` while a
 * request is open, and a long-lived Firestore stream is what once made Safari
 * print 20 seconds late.
 *
 * Independent of the project's own save on purpose. A card job printed from a
 * cookbook is never saved unless the cook asks, but an edit made in it still
 * has to reach the cookbook.
 *
 * What comes in from elsewhere is written outside the undo history, and every
 * recorded step is rebased onto it (`rebaseRecipeFields`), so Undo only ever
 * undoes what was done here and can never quietly revert another project.
 */
export function useLinkedRecipes({
  uid,
  savedProjectId,
  ready,
  items,
  getQueue,
  commitQueue,
  onConflicts,
  onPushed,
}: {
  uid: string | null;
  /** The project's id once it is saved to the account, else null. */
  savedProjectId: string | null;
  /** The project has loaded: its items are the ones to reconcile. */
  ready: boolean;
  /** The project's recipes. */
  items: QueueItem[] | null;
  getQueue: () => QueueItem[];
  commitQueue: (next: QueueItem[]) => void;
  onConflicts: (conflicts: LinkedConflict[]) => void;
  /** An edit made here reached the record, shared with these other saved
      projects (their names). */
  onPushed: (projectNames: string[]) => void;
}) {
  const [sharedWith, setSharedWith] = useState<Record<string, string[]>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const latest = useRef({ uid, savedProjectId, ready, items, getQueue, commitQueue, onConflicts, onPushed });
  latest.current = { uid, savedProjectId, ready, items, getQueue, commitQueue, onConflicts, onPushed };
  const running = useRef(false);
  const again = useRef(false);
  const namesLoaded = useRef<string | null>(null);
  const projectNamesRef = useRef<Record<string, string>>({});

  const names = useCallback(async (ids: string[]): Promise<Record<string, string>> => {
    const current = latest.current;
    if (!current.uid || ids.length === 0) return {};
    const known = projectNamesRef.current;
    if (ids.every((id) => known[id]) && namesLoaded.current === current.uid) return known;
    try {
      const { loadPrintProjectSummaries } = await import("@/lib/printProjects");
      const summaries = await loadPrintProjectSummaries(current.uid);
      const next = Object.fromEntries(summaries.map((summary) => [summary.id, projectListTitle(summary)]));
      namesLoaded.current = current.uid;
      projectNamesRef.current = next;
      setProjectNames(next);
      return next;
    } catch {
      return known;
    }
  }, []);

  const run = useCallback(async () => {
    const current = latest.current;
    if (!current.uid || !current.ready || !current.items) return;
    const linkedHere = current.items.some((item) => item.link);
    // Nothing linked, and nothing that could be: an unsaved project with no
    // linked recipe has no record anywhere to agree with.
    if (!linkedHere && !current.savedProjectId) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      const { reconcileLinkedRecipes } = await import("@/lib/linkedRecipeStore");
      const result = await reconcileLinkedRecipes(current.uid, current.savedProjectId, current.items);
      // The project changed under the reconcile (another one opened): its
      // answer belongs to that project and nothing here applies.
      if (latest.current.savedProjectId !== current.savedProjectId || latest.current.uid !== current.uid) return;
      if (result.updates.length > 0) {
        const byId = new Map(result.updates.map((update) => [update.itemId, update]));
        let changed = false;
        const next = latest.current.getQueue().map((item) => {
          const update = byId.get(item.id);
          if (!update || !item.recipe) return item;
          changed = true;
          const recipe: Recipe = applyRemoteFields(item.recipe, update.fromRemote);
          rebaseRecipeFields(item.id, update.fromRemote as Record<string, unknown>);
          const updated: QueueItem = { ...item, recipe, title: recipe.title || item.title };
          if (update.link) updated.link = update.link;
          else delete updated.link;
          return updated;
        });
        if (changed) withoutHistory(() => latest.current.commitQueue(next));
      }
      setSharedWith(result.sharedWith);
      const otherIds = Array.from(new Set(Object.values(result.sharedWith).flat()));
      const known = await names(otherIds);
      if (result.conflicts.length > 0) {
        latest.current.onConflicts(
          result.conflicts.map(({ itemId, conflicts }) => ({
            itemId,
            title: current.items?.find((item) => item.id === itemId)?.recipe?.title || "this recipe",
            conflicts,
          })),
        );
      }
      const reached = Array.from(
        new Set(result.pushed.flatMap((itemId) => result.sharedWith[itemId] ?? [])),
      ).map((id) => known[id]).filter((name): name is string => Boolean(name));
      if (reached.length > 0) latest.current.onPushed(reached);
    } catch (error) {
      // Best effort, like autosave's flush: the copy keeps the edit, and its
      // link still knows what it last agreed with, so the next run sends it.
      console.warn("RecipePrinter: could not sync linked recipes", error);
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void runRef.current();
      }
    }
  }, [names]);
  const runRef = useRef(run);
  runRef.current = run;

  // Opening a project, signing in, or the project being saved for the first
  // time (it becomes a member of what it shares).
  useEffect(() => {
    if (ready && uid) void runRef.current();
  }, [ready, uid, savedProjectId]);

  // An edit to a linked recipe: written out once typing pauses.
  const pendingEdit = Boolean(items?.some((item) => hasLocalChanges(item.recipe, item.link)));
  useEffect(() => {
    if (!pendingEdit || !ready || !uid) return;
    const timer = window.setTimeout(() => void runRef.current(), SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [items, pendingEdit, ready, uid]);

  useEffect(() => {
    const onVisibility = () => void runRef.current();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, []);

  /** The other saved projects one recipe is also in, by name. */
  const alsoIn = useCallback(
    (itemId: string): string[] =>
      (sharedWith[itemId] ?? []).map((id) => projectNames[id]).filter((name): name is string => Boolean(name)),
    [sharedWith, projectNames],
  );

  return { alsoIn, sync: run };
}
