"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, ICON_SIZE } from "@/components/icons";
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
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, RECIPES_ADDRESS, ownPageElements, type PageLooks } from "@/lib/pageLooks";

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
  // `index` tells apart the copies one element can have on a page (each
  // section heading of a list is the list's headings).
  const addressRef = useRef<{ page: string; element: string; index: number } | null>(null);
  const copiesOf = (page: string, element: string) =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        `.recipe-page-canvas [data-element-page="${CSS.escape(page)}"][data-element="${CSS.escape(element)}"]`,
      ),
    ).filter((copy) => !copy.closest("[aria-hidden='true'], [data-preview-hidden='true']"));
  const elementByAddress = (): HTMLElement | null => {
    const address = addressRef.current;
    if (!address) return null;
    const copies = copiesOf(address.page, address.element);
    return copies[address.index] ?? copies[0] ?? null;
  };
  // Where the line being edited sat inside its element. Once the field
  // closes (the size box took the focus), the bar stays over that same spot,
  // not over the whole element: anchoring to the ingredients or steps as a
  // block jumped the bar up the page the moment a size was clicked.
  const lineOffsetRef = useRef<{ dx: number; dy: number; width: number; height: number } | null>(null);
  const getAnchorRect = useCallback(
    () => {
      if (!field) return null;
      if (field.isConnected) {
        const rect = field.getBoundingClientRect();
        const block = field.closest("[data-element]")?.getBoundingClientRect();
        lineOffsetRef.current = block
          ? { dx: rect.left - block.left, dy: rect.top - block.top, width: rect.width, height: rect.height }
          : null;
        return rect;
      }
      const block = elementByAddress()?.getBoundingClientRect();
      if (!block) return null;
      const line = lineOffsetRef.current;
      return line ? new DOMRect(block.left + line.dx, block.top + line.dy, line.width, line.height) : block;
    },
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
  if (field.isConnected && elementNode && elementPage && elementName) {
    addressRef.current = {
      page: elementPage,
      element: elementName,
      index: Math.max(0, copiesOf(elementPage, elementName).indexOf(elementNode)),
    };
  }
  const sizeGroup =
    elementSize && elementNode && elementPage && elementName ? (
      <div className="recipe-page-toolbar__group" role="group" aria-label="Text size">
        <SizeDropdown
          partLabel={ELEMENT_LABELS[elementName]}
          // Looked up on every draw, not handed over once: typing in the size
          // box closes the field, and the element is redrawn as text.
          getNode={() =>
            field.isConnected ? field.closest<HTMLElement>("[data-element][data-element-page]") : elementByAddress()
          }
          size={ownPageElements(elementSize.styles, elementPage)?.[elementName]?.textSize}
          // A recipe page's Default is the size every recipe's part has
          // (Customize theme's Each part), when one is set.
          defaultScale={
            elementPage.startsWith("recipe:")
              ? elementSize.styles?.[RECIPES_ADDRESS]?.elements?.[elementName]?.textSize
              : undefined
          }
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
      {/* The size beside the line's kind (Body / Heading): both say what the
          text is set as, so they sit together, ahead of bold and italic. */}
      {sizeGroup}
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

export interface ElementSizeWiring {
  styles: PageLooks | undefined;
  /** `undefined` = back to the book's size. */
  onChange: (page: string, element: string, size: number | undefined) => void;
  proMarked: boolean;
}

/** Presses on the bar don't take focus from the field being edited, so the
    edit isn't ended by them. The size box is the one exception: it has to
    take focus to be typed in. */
function keepFieldFocus(event: ReactMouseEvent) {
  if ((event.target as HTMLElement).closest("input")) return;
  event.preventDefault();
}

/** Text that labels or prompts rather than being the element's words: a
    list's "Steps" heading, a step's number, "+ Add below", a fact's label. */
const NOT_MAIN_TEXT = "button, [data-field-prompt], [class*='__label'], [class*='add-line'], [class*='step-number']";

/**
 * The printed size, in points, of the text most of an element is written in:
 * an ingredients list's lines rather than its heading, a step's words rather
 * than its number. That's the size the cook is choosing; everything else in
 * the element keeps its size relative to it. Measured by characters, so a
 * heading that a theme sets bigger than the lines doesn't stand in for them.
 */
function printedPoints(node: HTMLElement): number {
  const chars = new Map<number, number>();
  const count = (el: Element, length: number) => {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (Number.isFinite(size) && length > 0) chars.set(size, (chars.get(size) ?? 0) + length);
  };
  // A line being typed in is a field, whose words are its value.
  // Only this element's own words: a list's headings are an element of
  // their own inside it, with a size of their own.
  const own = (el: Element) => el.closest("[data-element]") === node || el === node;
  const fields = node.matches("textarea, input") ? [node] : Array.from(node.querySelectorAll("textarea, input"));
  for (const field of fields) if (own(field)) count(field, (field as HTMLTextAreaElement).value.trim().length);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const parent = text.parentElement;
    const length = text.textContent?.trim().length ?? 0;
    if (!parent || !length || !own(parent) || parent.closest(NOT_MAIN_TEXT)) continue;
    count(parent, length);
  }
  let px = 0;
  let most = 0;
  chars.forEach((length, size) => {
    if (length > most || (length === most && size > px)) {
      most = length;
      px = size;
    }
  });
  if (px === 0) px = parseFloat(getComputedStyle(node).fontSize) || 0;
  // CSS px are 1/96in, points 1/72in. The deck is scaled with a transform,
  // which computed sizes don't see, so this is the size on paper.
  return px * 0.75;
}

function roundHalf(points: number): number {
  return Math.round(points * 2) / 2;
}

/** What each element is called on the size control. Every element a page
    marks (lib/pageLooks.tsx) is named here; one that isn't shows no label. */
const ELEMENT_LABELS: Record<string, string> = {
  title: "Title",
  notes: "Notes",
  details: "Details",
  ingredients: "Ingredients",
  steps: "Steps",
  "ingredients-headings": "Ingredients headings",
  "steps-headings": "Steps headings",
  subtitle: "Subtitle",
  intro: "Description",
  caption: "Caption",
  kicker: "Label",
  entries: "Contents",
  "cover-kicker": "Subtitle",
  "cover-title": "Title",
  "cover-byline": "Author",
  "cover-edition": "Edition",
  "dedication-heading": "Heading",
  "dedication-text": "Message",
  "dedication-signature": "Signature",
  "back-blurb": "Message",
  "back-credit": "Credit",
};

/** The sizes the list offers, in points, before it's cut to what this
    element allows and its Default is put in its place. */
const SIZE_PRESETS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96];

/**
 * This element's text size, the way a design app sets one: a box showing the
 * size in points, which takes a typed size, and a chevron opening a list of
 * sizes. The list marks the current size with a check and the element's
 * Default (what it is with no size of its own: the book's Text size for it)
 * with the word Default; picking Default puts the element back to following
 * the book.
 *
 * Points because that's what a printed size is measured in, the number Word
 * and Google Docs show. Stored as a multiple of the theme's Normal size
 * (lib/pageLooks.tsx), so everything inside the element (an ingredients list's
 * headings, a step's number) grows with its main text.
 */
export function SizeDropdown({
  partLabel,
  partHeading = true,
  getNode,
  defaultScale,
  size,
  proMarked,
  onChange,
}: {
  /** What the size applies to ("Steps", "Title"), said at the top of the list:
      the size is the whole part's, not just the line being typed in. */
  partLabel?: string;
  /** Say `partLabel` at the top of the list. Off where the part is already
      named beside the dropdown (Customize theme's Fine-tune sizes). */
  partHeading?: boolean;
  getNode: () => HTMLElement | null;
  /** The size this element has with no size of its own, when it isn't simply
      what it inherits from around it (a recipe part set for every recipe;
      the book's Text size, for Customize theme's own rows). */
  defaultScale?: number;
  size: number | undefined;
  proMarked: boolean;
  onChange: (size: number | undefined) => void;
}) {
  // The element as drawn: its biggest text, and the scale it's drawn at (its
  // own size, or the book's). Their ratio is its size at the theme's Normal,
  // which stays true while a change is still on its way to the page. The
  // book's scale is what the element inherits, read above its own.
  const node = getNode();
  const scaleOf = (el: Element | null | undefined) =>
    el ? parseFloat(getComputedStyle(el).getPropertyValue("--recipe-font-scale")) || 1 : 1;
  const drawnScale = scaleOf(node);
  const bookScale = defaultScale ?? scaleOf(node?.parentElement);
  const normalPoints = node ? printedPoints(node) / drawnScale : 0;
  // With no size of its own it's at its Default: the one given, or else the
  // size it's drawn at (which is then the one it inherits).
  const shownPoints = roundHalf(normalPoints * (size ?? defaultScale ?? drawnScale));
  const defaultPoints = roundHalf(normalPoints * bookScale);
  const minPoints = roundHalf(normalPoints * MIN_TEXT_SIZE);
  const maxPoints = roundHalf(normalPoints * MAX_TEXT_SIZE);

  const [draft, setDraft] = useState<string | null>(null);
  const [openAt, setOpenAt] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const setPoints = (points: number) => {
    if (!Number.isFinite(points) || normalPoints <= 0) return;
    // The Default size is following the book, not a size of its own.
    if (roundHalf(points) === defaultPoints) {
      onChange(undefined);
      return;
    }
    const scale = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, points / normalPoints));
    onChange(Math.round(scale * 1000) / 1000);
  };
  const commitDraft = () => {
    if (draft === null) return;
    const typed = parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(typed) && roundHalf(typed) !== shownPoints) setPoints(roundHalf(typed));
  };

  const sizes = Array.from(
    new Set([...SIZE_PRESETS.filter((points) => points >= minPoints && points <= maxPoints), defaultPoints, shownPoints]),
  ).sort((a, b) => a - b);

  // While the list is open, typing a size types it here, not into the line
  // the cook is editing: the line keeps the focus (so the bar stays exactly
  // as it was), and its keys are taken before they reach it. Enter applies a
  // typed size, Escape closes the list without ending the edit.
  const open = Boolean(openAt);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const applyDraftRef = useRef(commitDraft);
  applyDraftRef.current = commitDraft;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const typed = draftRef.current;
      if (/^[0-9.,]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setDraft((typed ?? "") + event.key);
      } else if (event.key === "Backspace" && typed !== null) {
        setDraft(typed.slice(0, -1));
      } else if (event.key === "Enter") {
        if (typed) applyDraftRef.current();
        setOpenAt(null);
      } else if (event.key === "Escape") {
        setDraft(null);
        setOpenAt(null);
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    // Text that arrives without a key press (a phone keyboard, dictation,
    // autofill) is input, not keydown: taken the same way, so nothing typed
    // while the list is open ever lands in the recipe.
    const onInput = (event: InputEvent) => {
      if (!event.inputType.startsWith("insert") && !event.inputType.startsWith("delete")) return;
      event.preventDefault();
      event.stopPropagation();
      const digits = (event.data ?? "").replace(/[^0-9.,]/g, "");
      if (event.inputType.startsWith("delete")) setDraft((current) => (current === null ? null : current.slice(0, -1)));
      else if (digits) setDraft((current) => (current ?? "") + digits);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("beforeinput", onInput, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("beforeinput", onInput, true);
    };
  }, [open]);

  const toggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Never takes the focus: the line being edited keeps it, so nothing
    // else on the bar changes when the list opens.
    event.preventDefault();
    setDraft(null);
    if (openAt) {
      setOpenAt(null);
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    setOpenAt({ x: box.left, y: box.bottom + 4 });
  };

  return (
    <>
      {/* The dropdown and its crown are one control, so wherever it is laid
          out (a row spreading its children apart, in Customize theme) the
          crown stays beside the size it marks. */}
      <span className="recipe-text-toolbar__size-control">
        {/* One control, opened by one press anywhere on it: the number and the
            chevron are the same button. */}
        <button
          ref={triggerRef}
          type="button"
          className="recipe-text-toolbar__size"
          aria-haspopup="menu"
          aria-expanded={openAt ? true : undefined}
          aria-label={`${partLabel ? `${partLabel} text size` : "Text size"}: ${shownPoints} points`}
          title="Text size"
          onMouseDown={toggle}
          onKeyDown={(event) => {
            // Reached by keyboard (the field closed on the way here), Enter or
            // Space opens it too.
            if ((event.key === "Enter" || event.key === " ") && !openAt) {
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              setOpenAt({ x: box.left, y: box.bottom + 4 });
            }
          }}
        >
          <span className={`recipe-text-toolbar__size-value ${draft !== null ? "is-typing" : ""}`}>
            {draft ?? String(shownPoints)}
          </span>
          <ChevronDownIcon size={ICON_SIZE.xs} aria-hidden />
        </button>
        {proMarked && size !== undefined && size !== DEFAULT_FONT_SCALE && (
          <ProBadge variant="inline" label={false} tooltip="This text size is Pro" />
        )}
      </span>
      {openAt && (
        <SizeMenu
          anchor={openAt}
          triggerRef={triggerRef}
          partLabel={partLabel}
          partHeading={partHeading}
          sizes={sizes}
          current={shownPoints}
          defaultPoints={defaultPoints}
          onPick={(points) => {
            setOpenAt(null);
            setDraft(null);
            setPoints(points);
          }}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

function SizeMenu({
  anchor,
  triggerRef,
  partLabel,
  partHeading,
  sizes,
  current,
  defaultPoints,
  onPick,
  onClose,
}: {
  anchor: { x: number; y: number };
  triggerRef: RefObject<HTMLButtonElement | null>;
  partLabel?: string;
  partHeading: boolean;
  sizes: number[];
  current: number;
  defaultPoints: number;
  onPick: (points: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8))}px`;
    // Opens on the size in use, not at the top of a long list.
    node.querySelector<HTMLElement>("[aria-checked='true']")?.scrollIntoView({ block: "center" });
  }, [anchor]);
  useMenuDismiss([ref, triggerRef], onClose);
  return createPortal(
    <div
      ref={ref}
      className="cp-menu rail-tile-menu add-line-menu text-size-menu no-print"
      role="menu"
      aria-label={partLabel ? `${partLabel} text size` : "Text size"}
      style={{ top: anchor.y, left: anchor.x }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {/* Which part these sizes are for, held at the top while the sizes
          scroll under it. */}
      {partLabel && partHeading && (
        <p className="text-size-menu__part" aria-hidden>
          {partLabel}
        </p>
      )}
      {sizes.map((points) => {
        const active = points === current;
        return (
          <button
            key={points}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            className={`cp-menu__item text-size-menu__item ${active ? "is-active" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(points);
            }}
          >
            <span className="text-size-menu__check" aria-hidden>
              {active && <CheckIcon size={ICON_SIZE.sm} />}
            </span>
            <span className="text-size-menu__points">{points}</span>
            {points === defaultPoints && <span className="text-size-menu__default">Default</span>}
          </button>
        );
      })}
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
