"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BodyTextGlyph, HeadingGlyph } from "@/components/RecipeCardPrint";
import { TextStyleControl } from "@/components/print/TextStyleControl";
import { readFocusedRichField } from "@/lib/richTextField";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";

/** How far the bar sits off the field it belongs to, and off the viewport edge. */
const GAP = 8;
const MARGIN = 8;

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
   * Put the bar above the field, or below it when above is taken.
   *
   * Writes straight to the node rather than through state: this runs on every
   * scroll frame, and the deck is the one surface in the app where a render per
   * frame is measurably expensive.
   */
  const place = useCallback(() => {
    const bar = barRef.current;
    if (!bar || !field || !field.isConnected) return;
    const anchor = field.getBoundingClientRect();
    const self = bar.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewLeft = viewport?.offsetLeft ?? 0;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const viewWidth = viewport?.width ?? window.innerWidth;

    // Centred on the field, then pulled back inside the viewport. Settled
    // before the vertical, because whether the bar clears the page toolbar
    // depends on where it ends up horizontally.
    const left = Math.max(
      viewLeft + MARGIN,
      Math.min(
        anchor.left + anchor.width / 2 - self.width / 2,
        viewLeft + viewWidth - self.width - MARGIN,
      ),
    );

    // The page toolbar is the other floating thing over this card. Landing on
    // top of it is exactly the muddle this split is meant to end, so the bar
    // goes under the field instead when the space above belongs to that one.
    const pageBar = document
      .querySelector(".recipe-page-canvas__controls .recipe-page-toolbar")
      ?.getBoundingClientRect();
    const above = anchor.top - self.height - GAP;
    const collides = Boolean(
      pageBar &&
        above < pageBar.bottom + GAP &&
        above + self.height + GAP > pageBar.top &&
        left < pageBar.right + GAP &&
        left + self.width + GAP > pageBar.left,
    );
    const top = above >= viewTop + MARGIN && !collides ? above : anchor.bottom + GAP;

    bar.style.left = `${left}px`;
    bar.style.top = `${Math.max(
      viewTop + MARGIN,
      Math.min(top, viewTop + viewHeight - self.height - MARGIN),
    )}px`;
    bar.style.visibility = "visible";
  }, [field]);

  // Before paint, so the bar is never seen at the top-left corner it renders at.
  useLayoutEffect(place);

  useEffect(() => {
    if (!field) return;
    // `capture` because the deck scrolls, not the window — a bubbling listener
    // on `window` never hears it.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    // Typing wraps the line onto a second row, which moves everything under it.
    const observer = new ResizeObserver(place);
    observer.observe(field);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      observer.disconnect();
    };
  }, [field, place]);

  if (!field) return null;

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
  // plain textarea, and the buttons would sit there doing nothing.
  const richText = field.isContentEditable;

  if (!lineKind && !richText) return null;

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
      {richText && <TextStyleControl />}
    </div>,
    document.body,
  );
}
