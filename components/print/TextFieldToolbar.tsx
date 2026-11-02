"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";
import { TextStyleControl } from "@/components/print/TextStyleControl";
import { textBarScale } from "@/lib/deckZoom";
import { readLineSelection } from "@/lib/lineSelection";
import { readFocusedRichField } from "@/lib/richTextField";
import { isAllCaps, isTitleCase, toAllCaps, toTitleCase } from "@/lib/titleCase";
import { useFloatingBarPlacement } from "@/lib/useFloatingBarPlacement";
import { useMenuDismiss } from "@/lib/useMenuDismiss";
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
export function TextFieldToolbar({
  inlineEdit,
  zoom = 1,
  introReset,
}: {
  inlineEdit?: RecipeCardInlineEdit;
  /** The deck's zoom. The bar grows with it — see `textBarScale`. */
  zoom?: number;
  /** The way back from a chapter's own description to the line built from its
      recipes' names. Present only while there is something to go back from; it
      is offered on that one field and nowhere else. */
  introReset?: { derived: string; onReset: () => void };
}) {
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

  // A chapter's description is a plain textarea with no formatting to offer, so
  // the bar it gets holds the one thing that is specific to it.
  if (field.classList.contains("recipe-card__chapter-intro")) {
    if (!introReset) return null;
    return createPortal(
      <div
        ref={barRef}
        className="recipe-page-toolbar recipe-text-toolbar no-print"
        style={{ "--rp-text-bar-scale": textBarScale(zoom) } as CSSProperties}
        role="toolbar"
        aria-label="Chapter description"
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="recipe-page-toolbar__group">
          <button
            type="button"
            className="recipe-page-toolbar__btn"
            title={introReset.derived}
            // On mousedown with the default prevented, like every control on
            // this bar: a click would blur the field first and close it.
            onMouseDown={(event) => {
              event.preventDefault();
              introReset.onReset();
            }}
          >
            Use recipe names
          </button>
        </div>
      </div>,
      document.body,
    );
  }

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

  // The title's own switch, in the same place and the same shape as a line's
  // body/heading pair: a lot of titles are imported in capitals.
  const isTitle = target?.kind === "title";

  if (!lineKind && !richText && !isTitle) return null;

  /**
   * Only where there is something to style.
   *
   * These sat in the bar permanently disabled on a section heading, to keep the
   * bar one width on every line: removing them meant pressing H shrank the bar
   * under the cursor that had just pressed it. But a heading is a plain
   * textarea and always will be, so that bought a steady width with two
   * controls that could never do anything on any heading, ever. A control that
   * is never available is not a disabled control, it is a control that does not
   * belong to this field.
   *
   * The bar is centred on the field, so it now narrows evenly around the line
   * rather than sliding off to one side. The note and the description have no
   * line-kind switch either, for the same reason in the other direction: they
   * are not lines and can never become headings.
   */
  const styleGroup = richText ? <TextStyleControl /> : null;

  return createPortal(
    <div
      ref={barRef}
      className="recipe-page-toolbar recipe-text-toolbar no-print"
      style={{ "--rp-text-bar-scale": textBarScale(zoom) } as CSSProperties}
      role="toolbar"
      aria-label="Text formatting"
      // The buttons each do this for themselves; the bar's own padding needs it
      // too, or a press that lands between two of them commits the edit.
      onMouseDown={(event) => event.preventDefault()}
    >
      {lineKind && inlineEdit && (
        <div className="recipe-page-toolbar__group" role="group" aria-label="Line type">
          <LineKindSelect
            isHeading={isHeading}
            onPick={(kind) => inlineEdit.onSetLineKind(lineKind, kind, readFocusedRichField() ?? undefined)}
          />
        </div>
      )}
      {isTitle && inlineEdit && (
        <div className="recipe-page-toolbar__group" role="group" aria-label="Title case">
          {/* Rewrites the text rather than styling it: Title Case can't be
              drawn from capitals (CSS `capitalize` raises "and" and "of" too),
              and a rewrite prints the way it reads here and saves like any
              other edit to the title. */}
          <button
            type="button"
            className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
              isAllCaps(inlineEdit.value) ? "is-active" : ""
            }`}
            aria-label="All caps"
            aria-pressed={isAllCaps(inlineEdit.value)}
            title="All caps"
            onMouseDown={(event) => {
              event.preventDefault();
              inlineEdit.onValueChange(toAllCaps(inlineEdit.value));
            }}
          >
            <span className="recipe-card__line-kind-glyph" aria-hidden>AA</span>
          </button>
          <button
            type="button"
            className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
              isTitleCase(inlineEdit.value) ? "is-active" : ""
            }`}
            aria-label="Title case"
            aria-pressed={isTitleCase(inlineEdit.value)}
            title="Title case"
            onMouseDown={(event) => {
              event.preventDefault();
              inlineEdit.onValueChange(toTitleCase(inlineEdit.value));
            }}
          >
            <span className="recipe-card__line-kind-glyph" aria-hidden>Aa</span>
          </button>
        </div>
      )}
      {styleGroup}
    </div>,
    document.body,
  );
}

/**
 * Body or heading, as a dropdown naming what the line is now ("Body ⌄"), the
 * way a document editor's text-style menu does. It was a pair of glyph
 * buttons, H and Aa, which said nothing until hovered.
 *
 * Everything here acts on `mousedown` with the default prevented, like the
 * rest of the bar: a click would blur the field first and end the edit.
 */
function LineKindSelect({
  isHeading,
  onPick,
}: {
  isHeading: boolean;
  onPick: (kind: "body" | "heading") => void;
}) {
  const [openAt, setOpenAt] = useState<{ x: number; y: number } | null>(null);
  // Part of the menu as far as closing goes: a press on it is not "outside",
  // or that press closed the menu and then, as the same press, opened it again.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const label = isHeading ? "Heading" : "Body";
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="recipe-page-toolbar__btn recipe-text-toolbar__select"
        aria-haspopup="menu"
        aria-expanded={openAt ? true : undefined}
        aria-label={`Line type: ${label}`}
        onMouseDown={(event) => {
          event.preventDefault();
          if (openAt) {
            setOpenAt(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setOpenAt({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        <span>{label}</span>
        <ChevronDownIcon size={ICON_SIZE.xs} aria-hidden />
      </button>
      {openAt && (
        <LineKindMenu
          anchor={openAt}
          triggerRef={triggerRef}
          isHeading={isHeading}
          onPick={(kind) => {
            setOpenAt(null);
            if ((kind === "heading") !== isHeading) onPick(kind);
          }}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

function LineKindMenu({
  anchor,
  triggerRef,
  isHeading,
  onPick,
  onClose,
}: {
  anchor: { x: number; y: number };
  triggerRef: RefObject<HTMLButtonElement | null>;
  isHeading: boolean;
  onPick: (kind: "body" | "heading") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Each row is set in the card's own type for that kind of line, read off
  // the card being edited, so "Heading" looks like this card's headings.
  const [looks] = useState(() => cardLooks());
  // Opens under its button, and comes back inside the window near an edge.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8))}px`;
  }, [anchor]);
  useMenuDismiss([ref, triggerRef], onClose);
  const item = (kind: "body" | "heading", text: string) => {
    const active = (kind === "heading") === isHeading;
    return (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={active}
        className={`cp-menu__item line-kind-menu__item line-kind-menu__item--${kind} ${active ? "is-active" : ""}`}
        style={looks[kind]}
        onMouseDown={(event) => {
          event.preventDefault();
          onPick(kind);
        }}
      >
        {text}
      </button>
    );
  };
  return createPortal(
    <div
      ref={ref}
      className="cp-menu rail-tile-menu add-line-menu line-kind-menu no-print"
      role="menu"
      aria-label="Line type"
      style={{ top: anchor.y, left: anchor.x }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {item("body", "Body")}
      {item("heading", "Heading")}
    </div>,
    document.body,
  );
}

/**
 * The card's own type for a body line and a section heading: family, weight,
 * slant, case and spacing, read from the card that has the caret (its section
 * heading, or failing that its "Ingredients" label, and its first line). Not
 * the size: the card is drawn small to fit, and the menu is read at the app's
 * size.
 */
function cardLooks(): Record<"body" | "heading", CSSProperties | undefined> {
  const card = document.activeElement?.closest(".recipe-card") ?? null;
  const look = (el: Element | null | undefined): CSSProperties | undefined => {
    if (!el) return undefined;
    const style = getComputedStyle(el);
    return {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textTransform: style.textTransform as CSSProperties["textTransform"],
      letterSpacing: style.letterSpacing,
    };
  };
  return {
    body: look(card?.querySelector(".recipe-card__editable-line")),
    heading: look(card?.querySelector(".recipe-card__section-title") ?? card?.querySelector(".recipe-card__label")),
  };
}
