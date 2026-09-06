"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ICON_SIZE, TrashIcon } from "@/components/icons";
import { readLineSelection, selectionRect } from "@/lib/lineSelection";
import { useFloatingBarPlacement } from "@/lib/useFloatingBarPlacement";
import type { RecipeCardInlineEdit, RecipeCardLineTarget } from "@/lib/recipeCardLayout";

const RELEASE_EVENTS = ["pointerup", "pointercancel", "mouseup", "keyup"] as const;

function isTypingTarget(node: Element | null): boolean {
  return (
    node instanceof HTMLElement &&
    (node.isContentEditable ||
      node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement)
  );
}

/**
 * Delete a whole run of lines, for a drag that ran across them.
 *
 * Every row on the card is its own field, so dragging down a section already
 * made a perfectly ordinary browser selection across several of them — it just
 * meant nothing. Clearing a section was a line at a time: click in, select the
 * words, delete, watch the rows shuffle up, click the next one. This bar is
 * what that selection is for.
 *
 * It is the text toolbar's twin and wears its clothes: same slab, same size,
 * same placement, because both are "the bar for what you have your hands on".
 * Where the other one appears for a caret, this one appears for a range of two
 * or more lines. One line is a normal text selection inside one field, and
 * offering to delete the row for it would be a trap rather than a shortcut.
 *
 * It never asks first. A whole section is a lot to lose to a stray drag, so
 * what protects it is the Undo on the toast rather than a dialog in the way of
 * the common case.
 */
export function LineSelectionToolbar({ inlineEdit }: { inlineEdit?: RecipeCardInlineEdit }) {
  const [targets, setTargets] = useState<RecipeCardLineTarget[]>([]);
  const barRef = useRef<HTMLDivElement | null>(null);
  // A selection is still being made while the button is down. Reading it then
  // would flash the bar up under the cursor mid-drag and re-place it on every
  // pixel, so the read waits for the release.
  const draggingRef = useRef(false);

  useEffect(() => {
    const read = () => {
      if (draggingRef.current) return;
      setTargets((current) => {
        const next = readLineSelection();
        if (next.length === current.length && next.every((t, i) =>
          t.kind === current[i].kind && t.index === current[i].index)) {
          return current;
        }
        return next;
      });
    };
    const onPointerDown = () => {
      draggingRef.current = true;
    };
    const onRelease = () => {
      draggingRef.current = false;
      read();
    };
    read();
    document.addEventListener("selectionchange", read);
    // Capture, so a press that a card or a menu stops still counts as the end
    // of a drag; without it the bar would never come back.
    document.addEventListener("pointerdown", onPointerDown, true);
    // Every way a press can end, because a press this never hears the end of
    // leaves the bar switched off for the rest of the session.
    for (const event of RELEASE_EVENTS) document.addEventListener(event, onRelease, true);
    window.addEventListener("blur", onRelease);
    return () => {
      document.removeEventListener("selectionchange", read);
      document.removeEventListener("pointerdown", onPointerDown, true);
      for (const event of RELEASE_EVENTS) document.removeEventListener(event, onRelease, true);
      window.removeEventListener("blur", onRelease);
    };
  }, []);

  const active = targets.length > 1 && Boolean(inlineEdit);
  useFloatingBarPlacement({ barRef, getAnchorRect: selectionRect, active });

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setTargets([]);
  }, []);

  const deleteLines = useCallback(() => {
    if (!inlineEdit || targets.length < 2) return;
    inlineEdit.onDeleteLines(targets);
    clearSelection();
  }, [clearSelection, inlineEdit, targets]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      // A field with focus is having its own text deleted, not the card's rows.
      if (isTypingTarget(document.activeElement)) return;
      event.preventDefault();
      /**
       * The page listens for Backspace too, to delete the whole recipe. It
       * stands down while text is selected — precisely because a drag across
       * lines used to reach it — but the selection is gone the moment these
       * lines are, so stopping the event here is what keeps the recipe from
       * being the next thing asked about.
       */
      event.stopPropagation();
      deleteLines();
    }
    // Capture: the page's own Backspace handler is bound to `document` too, and
    // this has to be the one that answers first.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, clearSelection, deleteLines]);

  if (!active) return null;

  return createPortal(
    <div
      ref={barRef}
      className="recipe-page-toolbar recipe-text-toolbar no-print"
      role="toolbar"
      aria-label="Selected lines"
      // Pressing the bar must not collapse the selection it is about to act on.
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="recipe-page-toolbar__group" role="group" aria-label="Selected lines">
        <button
          type="button"
          className="recipe-page-toolbar__btn recipe-page-toolbar__btn--danger"
          title="Delete the selected lines (Delete)"
          onMouseDown={(event) => {
            event.preventDefault();
            deleteLines();
          }}
        >
          <TrashIcon size={ICON_SIZE.sm} />
          {`Delete ${targets.length} lines`}
        </button>
      </div>
    </div>,
    document.body,
  );
}
