"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BodyTextGlyph, HeadingGlyph } from "@/components/RecipeCardPrint";
import { TextStyleControl } from "@/components/print/TextStyleControl";
import { readLineSelection } from "@/lib/lineSelection";
import { readFocusedRichField } from "@/lib/richTextField";
import { useFloatingBarPlacement } from "@/lib/useFloatingBarPlacement";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";

/**
 * The card's inline fields, and nothing else on the page.
 *
 * Every rich field is a `contentEditable` div (`InlineRichField`) and is
 * unambiguous on its own. The plain `<textarea>`/`<input>` fields are only the
 * card's when they are inside one — the settings panel and the add-recipe
 * dialog are full of inputs this bar has no business following.
 */
function inlineFieldFrom(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  if (node.isContentEditable) return node;
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    return node.closest(".recipe-card") ? node : null;
  }
  return null;
}

/**
 * Formatting for the line being typed, floating directly above that line.
 *
 * These two groups — body/heading and bold/italic — used to APPEAR inside the
 * page toolbar while a field was open. One bar, two jobs: it changed shape and
 * width the moment text was clicked into, so Delete and Move slid sideways
 * under the cursor and the controls that act on the whole page looked like
 * they had been replaced by controls that act on four words. People read that
 * as the toolbar breaking.
 *
 * So there are two bars now, each anchored to what it acts on. The page
 * toolbar holds still above the card and never changes with the selection.
 * This one belongs to the field, appears with it, and sits where the text is —
 * which is also where the eye already is.
 *
 * Positioned from the field's own rect rather than rendered beside it: the
 * card is drawn at print scale, so app chrome mounted INSIDE it lands at about
 * a third of a legible size. Fixed to the viewport through a portal, it is
 * drawn at full size wherever the field happens to be.
 */
export function TextFieldToolbar({ inlineEdit }: { inlineEdit?: RecipeCardInlineEdit }) {
  const [field, setField] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  // Focus moving BETWEEN two fields blurs the first before it focuses the
  // second — and a body→heading switch replaces the field outright. Clearing on
  // the blur alone flickers the bar out and back in on both. Held for a frame
  // instead, and cancelled by whatever takes focus next.
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    const cancelPendingClear = () => {
      if (blurTimer.current === null) return;
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    };
    const onFocusIn = (event: FocusEvent) => {
      const next = inlineFieldFrom(event.target);
      if (!next) return;
      cancelPendingClear();
      setField(next);
    };
    const onFocusOut = () => {
      cancelPendingClear();
      blurTimer.current = window.setTimeout(() => {
        blurTimer.current = null;
        setField(inlineFieldFrom(document.activeElement));
      }, 0);
    };
    // A field may already be open when this mounts (the deck remounts around
    // an edit in progress more often than it looks).
    setField(inlineFieldFrom(document.activeElement));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelPendingClear();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  /**
   * A drag across several lines belongs to the other bar.
   *
   * The field it started in blurs on the way out, but not always before the
   * drag ends, so both bars could be up at once over the same three lines —
   * one offering to bold a selection the browser will not let it touch. Two
   * floating bars over one card is the muddle this pair was split up to end.
   */
  const [spansLines, setSpansLines] = useState(false);
  useEffect(() => {
    const read = () => setSpansLines(readLineSelection().length > 1);
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  const getAnchorRect = useCallback(
    () => (field?.isConnected ? field.getBoundingClientRect() : null),
    [field],
  );
  // Typing wraps the line onto a second row, which moves everything under it,
  // so the field is watched as well as the viewport.
  useFloatingBarPlacement({ barRef, getAnchorRect, observe: field, active: Boolean(field) });

  if (!field || spansLines) return null;

  // Only a line has a kind to change. The title, the times, the note and the
  // link are themselves and cannot become headings.
  const target = inlineEdit?.editingTarget ?? null;
  const lineKind =
    target &&
    (target.kind === "ingredient" ||
      target.kind === "step" ||
      target.kind === "ingredientSection" ||
      target.kind === "instructionSection")
      ? target
      : null;
  const isHeading =
    lineKind?.kind === "ingredientSection" || lineKind?.kind === "instructionSection";
  // Bold and italic are `execCommand` on a rich field. A section heading is a
  // plain textarea, where they have nothing to act on.
  const richText = field.isContentEditable;

  if (!lineKind && !richText) return null;

  /**
   * A line's bar is the same bar whichever line it is on.
   *
   * Bold and italic used to be REMOVED for a section heading, which is a plain
   * textarea rather than a rich field. That made the bar two sizes: pressing
   * H turned the row into a heading and the bar lost a third of its width
   * under the cursor that had just pressed it, which reads as the toolbar
   * breaking rather than as the line changing. Disabled says the same thing
   * about what a heading can hold without moving anything.
   *
   * The note and the description keep the narrow bar: they are not lines and
   * can never become headings, so a disabled line-kind switch on them would be
   * offering something that does not exist.
   */
  const styleGroup = lineKind || richText ? <TextStyleControl disabled={!richText} /> : null;

  return createPortal(
    <div
      ref={barRef}
      className="recipe-page-toolbar recipe-text-toolbar no-print"
      role="toolbar"
      aria-label="Text formatting"
      // The buttons each do this for themselves; the bar's own padding needs it
      // too, or a press that lands between two of them commits the edit.
      onMouseDown={(event) => event.preventDefault()}
    >
      {lineKind && inlineEdit && (
        <div className="recipe-page-toolbar__group" role="group" aria-label="Line type">
          {/* Heading first: it is the one being reached for. Body is where the
              line already is. */}
          <button
            type="button"
            className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
              isHeading ? "is-active" : ""
            }`}
            aria-label="Heading"
            aria-pressed={isHeading}
            title="Heading"
            onMouseDown={(event) => {
              event.preventDefault();
              if (!isHeading) {
                inlineEdit.onSetLineKind(lineKind, "heading", readFocusedRichField() ?? undefined);
              }
            }}
          >
            <HeadingGlyph />
          </button>
          <button
            type="button"
            className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
              isHeading ? "" : "is-active"
            }`}
            aria-label="Body text"
            aria-pressed={!isHeading}
            title="Body text"
            onMouseDown={(event) => {
              event.preventDefault();
              if (isHeading) {
                inlineEdit.onSetLineKind(lineKind, "body", readFocusedRichField() ?? undefined);
              }
            }}
          >
            <BodyTextGlyph />
          </button>
        </div>
      )}
      {styleGroup}
    </div>,
    document.body,
  );
}
