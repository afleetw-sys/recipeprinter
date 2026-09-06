"use client";

import type { RecipeCardLineTarget } from "@/lib/recipeCardLayout";

const LINE_KINDS = new Set<RecipeCardLineTarget["kind"]>([
  "ingredient",
  "step",
  "ingredientSection",
  "instructionSection",
]);

/**
 * Does the selection actually cover any of this line, or does it merely end
 * where the line begins?
 *
 * `Range.intersectsNode` says yes to a touch, and a drag that stops at the
 * start of the next row touches it every time — so it would offer to delete a
 * line the cook never dragged over. Comparing the boundary points strictly
 * (start before the line's end AND end after the line's start) counts overlap
 * only where there is some.
 */
function overlaps(range: Range, node: Node): boolean {
  const lineRange = document.createRange();
  lineRange.selectNodeContents(node);
  try {
    return (
      range.compareBoundaryPoints(Range.END_TO_START, lineRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, lineRange) > 0
    );
  } catch {
    // Ranges in different documents can't be compared. Nothing to select.
    return false;
  }
}

/**
 * The card lines the current text selection runs across, in document order.
 *
 * The lines are already selectable — every row is its own field, so dragging
 * across a section makes an ordinary cross-element browser selection, it just
 * had nothing that could act on it. This reads that selection back as targets
 * the editor understands.
 *
 * Only lines on the card being edited carry `data-line-kind` (see
 * RecipeCardPrint), so a selection that strays into a second card, the rail,
 * or the marketing copy around the deck simply finds nothing.
 *
 * Two lines minimum: one is a normal text selection inside a single field, and
 * offering to delete the whole row for it would be a trap.
 */
export function readLineSelection(): RecipeCardLineTarget[] {
  if (typeof window === "undefined") return [];
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const host = container instanceof Element ? container : container.parentElement;
  const card = host?.closest<HTMLElement>(".recipe-card");
  if (!card) return [];

  const targets: RecipeCardLineTarget[] = [];
  const lines = Array.from(card.querySelectorAll<HTMLElement>("[data-line-kind]"));
  for (const node of lines) {
    const kind = node.dataset.lineKind as RecipeCardLineTarget["kind"] | undefined;
    const index = Number(node.dataset.lineIndex);
    if (!kind || !LINE_KINDS.has(kind) || !Number.isInteger(index)) continue;
    if (!overlaps(range, node)) continue;
    targets.push({ kind, index });
  }
  return targets.length > 1 ? targets : [];
}

/** Where the selection sits on screen, for the bar that floats over it. */
export function selectionRect(): DOMRect | null {
  const selection = typeof window === "undefined" ? null : window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  return selection.getRangeAt(0).getBoundingClientRect();
}
