"use client";

import { useMemo, useState } from "react";
import type { Section } from "@/types/recipe";

interface UseRailSelectionOptions {
  /** Book order source — ranges and ordering follow section + item order. */
  sections: Section[];
  organizeMode: boolean;
  enterOrganizeMode: () => void;
  /** The recipe on the page currently in view: the range-select anchor fallback,
      and always folded into the effective selection (so a selection of two while
      viewing a third reads and acts on all three). */
  activeSelectableRecipeId: string | null;
}

/**
 * Rail multi-select (cookbook): Cmd/Ctrl-click toggles recipes into a selection,
 * Shift-click selects a range in book order; two or more brings up the bulk bar.
 * Pure selection state — the actions it feeds (e.g. "make a section from the
 * selection") live in the print page, which consumes `orderedRailSelection` /
 * `clearRailSelection`.
 */
export function useRailSelection({
  sections,
  organizeMode,
  enterOrganizeMode,
  activeSelectableRecipeId,
}: UseRailSelectionOptions) {
  const [selectedRailIds, setSelectedRailIds] = useState<Set<string>>(() => new Set());
  const [railAnchorId, setRailAnchorId] = useState<string | null>(null);

  const effectiveRailSelection = useMemo(() => {
    if (selectedRailIds.size === 0) return selectedRailIds;
    if (!activeSelectableRecipeId || selectedRailIds.has(activeSelectableRecipeId)) {
      return selectedRailIds;
    }
    const next = new Set(selectedRailIds);
    next.add(activeSelectableRecipeId);
    return next;
  }, [selectedRailIds, activeSelectableRecipeId]);

  function toggleRailSelection(recipeId: string) {
    if (!organizeMode) enterOrganizeMode();
    setRailAnchorId(recipeId);
    setSelectedRailIds((current) => {
      const next = new Set(current);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }

  // Shift-click: select every recipe between the anchor (last clicked, else the
  // page you're on) and this one, in book order — the customary range select.
  function selectRailRange(recipeId: string) {
    const ordered = sections.flatMap((section) => section.items).map((item) => item.id);
    const anchor = railAnchorId ?? activeSelectableRecipeId ?? recipeId;
    const from = ordered.indexOf(anchor);
    const to = ordered.indexOf(recipeId);
    if (from === -1 || to === -1) {
      toggleRailSelection(recipeId);
      return;
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    if (!organizeMode) enterOrganizeMode();
    setSelectedRailIds((current) => {
      const next = new Set(current);
      for (let i = lo; i <= hi; i += 1) next.add(ordered[i]);
      return next;
    });
  }

  function clearRailSelection() {
    setSelectedRailIds((current) => (current.size ? new Set() : current));
  }

  // Selected recipe ids in book order, so a new/receiving section keeps sequence.
  function orderedRailSelection(selection: ReadonlySet<string> = effectiveRailSelection): string[] {
    return sections
      .flatMap((section) => section.items)
      .map((item) => item.id)
      .filter((id) => selection.has(id));
  }

  return {
    selectedRailIds,
    effectiveRailSelection,
    setRailAnchorId,
    toggleRailSelection,
    selectRailRange,
    clearRailSelection,
    orderedRailSelection,
  };
}
