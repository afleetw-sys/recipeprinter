"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, ICON_SIZE, MinusIcon, PlusIcon, UndoIcon } from "@/components/icons";
import { TextStyleControl } from "@/components/print/TextStyleControl";
import { textBarScale } from "@/lib/deckZoom";
import { readLineSelection } from "@/lib/lineSelection";
import { readFocusedRichField } from "@/lib/richTextField";
import { isAllCaps, isTitleCase, toAllCaps, toTitleCase } from "@/lib/titleCase";
import { useFloatingBarPlacement } from "@/lib/useFloatingBarPlacement";
import { useMenuDismiss } from "@/lib/useMenuDismiss";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import { ProBadge } from "@/components/ProBadge";
import { DEFAULT_FONT_SCALE } from "@/lib/fontScale";
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, pageElements, type PageLooks } from "@/lib/pageLooks";

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
  // Words with no field of their own (an added page's lines, a caption, the
  // contents entries): focusable only so this bar can size them.
  if (node.matches("[data-element][tabindex='-1']")) return node;
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
  elementSize,
}: {
  inlineEdit?: RecipeCardInlineEdit;
  /** The deck's zoom. The bar grows with it — see `textBarScale`. */
  zoom?: number;
  /** The way back from a chapter's own description to the line built from its
      recipes' names. Present only while there is something to go back from; it
      is offered on that one field and nowhere else. */
  introReset?: { derived: string; onReset: () => void };
  /** The Size control: the element the field belongs to, at its own size or
      the book's (lib/pageLooks.tsx). Absent = no Size on this bar. */
  elementSize?: ElementSizeWiring;
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
        // Into the bar itself (its size box): the bar stays with the element
        // it was showing, even though that element's field has closed.
        if (barRef.current?.contains(document.activeElement)) return;
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

  // The element the bar is about, by address, so it can be found again after
  // its field closes and is redrawn as text (typing a size into the bar's own
  // box takes the focus, which closes the field).
  const addressRef = useRef<{ page: string; element: string } | null>(null);
  const elementByAddress = (): HTMLElement | null => {
    const address = addressRef.current;
    if (!address) return null;
    return document.querySelector<HTMLElement>(
      `.recipe-page-canvas [data-element-page="${CSS.escape(address.page)}"][data-element="${CSS.escape(address.element)}"]`,
    );
  };
  const getAnchorRect = useCallback(
    () =>
      field?.isConnected
        ? field.getBoundingClientRect()
        : field
          ? (elementByAddress()?.getBoundingClientRect() ?? null)
          : null,
    // elementByAddress reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field],
  );
  // Typing wraps the line onto a second row, which moves everything under it,
  // so the field is watched as well as the viewport.
  useFloatingBarPlacement({ barRef, getAnchorRect, observe: field, active: Boolean(field) });

  if (!field || spansLines) return null;

  // The element this field is part of: a recipe's ingredients, a cover's
  // title. Every element on every page carries its address.
  const elementNode = field.isConnected
    ? field.closest<HTMLElement>("[data-element][data-element-page]")
    : elementByAddress();
  const elementPage = elementNode?.dataset.elementPage;
  const elementName = elementNode?.dataset.element;
  if (elementPage && elementName) addressRef.current = { page: elementPage, element: elementName };
  const sizeGroup =
    elementSize && elementNode && elementPage && elementName ? (
      <div className="recipe-page-toolbar__group" role="group" aria-label="Text size">
        <SizeStepper
          // Looked up on every draw, not handed over once: typing in the size
          // box closes the field, and the element is redrawn as text.
          getNode={() =>
            field.isConnected ? field.closest<HTMLElement>("[data-element][data-element-page]") : elementByAddress()
          }
          size={pageElements(elementSize.styles, elementPage)?.[elementName]?.textSize}
          resetLabel={elementSize.resetLabel}
          proMarked={elementSize.proMarked}
          onChange={(size) => elementSize.onChange(elementPage, elementName, size)}
        />
      </div>
    ) : null;

  // A chapter's description is a plain textarea with no formatting to offer, so
  // the bar it gets holds the one thing that is specific to it.
  if (field.classList.contains("recipe-card__chapter-intro")) {
    if (!introReset && !sizeGroup) return null;
    return createPortal(
      <div
        ref={barRef}
        className="recipe-page-toolbar recipe-text-toolbar no-print"
        style={{ "--rp-text-bar-scale": textBarScale(zoom) } as CSSProperties}
        role="toolbar"
        aria-label="Chapter description"
        onMouseDown={keepFieldFocus}
      >
        {introReset && (
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
        )}
        {sizeGroup}
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

  if (!lineKind && !richText && !isTitle && !sizeGroup) return null;

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
      onMouseDown={keepFieldFocus}
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
      {sizeGroup}
    </div>,
    document.body,
  );
}

export interface ElementSizeWiring {
  styles: PageLooks | undefined;
  /** `undefined` = back to the book's size. */
  onChange: (page: string, element: string, size: number | undefined) => void;
  proMarked: boolean;
  /** The reset button's name: "Use the book's text size" in a cookbook. */
  resetLabel: string;
}

/** Presses on the bar don't take focus from the field being edited, so the
    edit isn't ended by them. The size box is the one exception: it has to
    take focus to be typed in. */
function keepFieldFocus(event: ReactMouseEvent) {
  if ((event.target as HTMLElement).closest("input")) return;
  event.preventDefault();
}

/** The printed size, in points, of the biggest text in an element: an
    ingredients list's lines rather than its headings, a step's words rather
    than its number. That's the size the cook is choosing; everything else in
    the element keeps its size relative to it. */
function printedPoints(node: HTMLElement): number {
  let px = 0;
  const consider = (el: Element) => {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (Number.isFinite(size) && size > px) px = size;
  };
  if (node.matches("textarea, input, [contenteditable='true']")) consider(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.textContent?.trim() && text.parentElement) consider(text.parentElement);
  }
  node.querySelectorAll("textarea, input").forEach(consider);
  if (px === 0) consider(node);
  // CSS px are 1/96in, points 1/72in. The deck is scaled with a transform,
  // which computed sizes don't see, so this is the size on paper.
  return px * 0.75;
}

function roundHalf(points: number): number {
  return Math.round(points * 2) / 2;
}

/**
 * This element's own text size: minus, the size in points, plus. The box
 * takes a typed size too. A reset button appears once the element has a size
 * of its own, and puts it back to following the book.
 *
 * Points because that's what a printed size is measured in, the number Word
 * and Google Docs show. Stored as a multiple of the theme's Normal size
 * (lib/pageLooks.tsx), so everything inside the element (an ingredients list's
 * headings, a step's number) grows with its main text.
 */
function SizeStepper({
  getNode,
  size,
  resetLabel,
  proMarked,
  onChange,
}: {
  getNode: () => HTMLElement | null;
  size: number | undefined;
  resetLabel: string;
  proMarked: boolean;
  onChange: (size: number | undefined) => void;
}) {
  // The element as drawn: its biggest text, and the scale it's drawn at (its
  // own size, or the book's). Their ratio is its size at the theme's Normal,
  // which stays true while a change is still on its way to the page.
  const node = getNode();
  const drawnScale = node ? parseFloat(getComputedStyle(node).getPropertyValue("--recipe-font-scale")) || 1 : 1;
  const normalPoints = node ? printedPoints(node) / drawnScale : 0;
  const shownPoints = roundHalf(normalPoints * (size ?? drawnScale));
  const [draft, setDraft] = useState<string | null>(null);

  const setPoints = (points: number) => {
    if (!Number.isFinite(points) || normalPoints <= 0) return;
    const scale = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, points / normalPoints));
    onChange(Math.round(scale * 1000) / 1000);
  };
  const minPoints = roundHalf(normalPoints * MIN_TEXT_SIZE);
  const maxPoints = roundHalf(normalPoints * MAX_TEXT_SIZE);
  const commitDraft = () => {
    if (draft === null) return;
    const typed = parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(typed) && roundHalf(typed) !== shownPoints) setPoints(roundHalf(typed));
  };

  return (
    <>
      <button
        type="button"
        className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
        aria-label="Smaller text"
        title="Smaller text"
        disabled={shownPoints <= minPoints}
        onMouseDown={(event) => {
          event.preventDefault();
          // Down to the next whole point: 9.6 goes to 9, then 8.
          setPoints(Math.ceil(shownPoints - 0.01) - 1);
        }}
      >
        <MinusIcon size={ICON_SIZE.xs} aria-hidden />
      </button>
      <label className="recipe-text-toolbar__size">
        <input
          className="recipe-text-toolbar__size-input"
          inputMode="decimal"
          aria-label="Text size in points"
          value={draft ?? String(shownPoints)}
          onFocus={(event) => {
            setDraft(String(shownPoints));
            event.currentTarget.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              // Applied, and the box goes back to showing the size as drawn
              // (a size past the range comes back as the nearest allowed).
              commitDraft();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span aria-hidden>pt</span>
      </label>
      <button
        type="button"
        className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
        aria-label="Bigger text"
        title="Bigger text"
        disabled={shownPoints >= maxPoints}
        onMouseDown={(event) => {
          event.preventDefault();
          setPoints(Math.floor(shownPoints + 0.01) + 1);
        }}
      >
        <PlusIcon size={ICON_SIZE.xs} aria-hidden />
      </button>
      {proMarked && size !== undefined && size !== DEFAULT_FONT_SCALE && (
        <ProBadge variant="inline" label={false} tooltip="This text size is Pro" />
      )}
      {size !== undefined && (
        <button
          type="button"
          className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
          aria-label={resetLabel}
          title={resetLabel}
          onMouseDown={(event) => {
            event.preventDefault();
            setDraft(null);
            onChange(undefined);
          }}
        >
          <UndoIcon size={ICON_SIZE.xs} aria-hidden />
        </button>
      )}
    </>
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
