"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { FONT_SCALES, type FontScale } from "@/lib/fontScale";
import type { SheetSlot } from "@/lib/usePrintSheets";

/**
 * The cook's own styling of single elements on single pages.
 *
 * Every page is still drawn from its data (a recipe, a cover, a chapter) by its
 * theme. What this adds is a layer on top, the way a design tool keeps a style
 * per element: each element a page draws has a stable address, its page and
 * its name ("recipe:<id>" / "ingredients", "cover" / "cover-title"), and an
 * address can carry an `ElementStyle` that overrides what the theme and the
 * book's settings would give it.
 *
 * Today the only thing an element can carry is its text size. The shape is
 * deliberately a bag of properties per address rather than a map of sizes, so a
 * font, colour, alignment or position for an element joins it here, beside
 * `textSize`, without another field on every page type or another migration.
 *
 * Addresses, not positions in a list: a recipe's id and a part's name survive
 * reordering, editing and re-importing, which an index into the ingredients
 * would not. A page that is deleted leaves its entry behind, harmlessly, until
 * `pruneElementStyles` drops it on save.
 */
export interface ElementStyle {
  /**
   * One of the five book sizes (`FONT_SCALES`), and it REPLACES the book's
   * size for this element rather than multiplying it, so nothing ever prints
   * outside the range the layout harness sweeps. Absent = follow the book.
   */
  textSize?: FontScale;
}

/** Element name -> its style, for one page. */
export type PageElementStyles = Record<string, ElementStyle>;
/** Page address -> its elements. Saved with the project (`settings.elementStyles`). */
export type ElementStyles = Record<string, PageElementStyles>;

/** The elements of a recipe page. The pagination budget reads these. */
export type RecipeElement = "title" | "notes" | "details" | "ingredients" | "steps";

function isFontScale(value: unknown): value is FontScale {
  return (FONT_SCALES as readonly unknown[]).includes(value);
}

function cleanStyle(value: unknown): ElementStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const style: ElementStyle = {};
  if (isFontScale(raw.textSize)) style.textSize = raw.textSize;
  return Object.keys(style).length > 0 ? style : undefined;
}

/** Keeps only what the app can draw: an old or hand-edited document can't put
    an unswept size on a page. Empty pages and empty styles are dropped. */
export function normalizeElementStyles(value: unknown): ElementStyles | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: ElementStyles = {};
  for (const [page, elements] of Object.entries(value as Record<string, unknown>)) {
    if (!elements || typeof elements !== "object") continue;
    const clean: PageElementStyles = {};
    for (const [element, style] of Object.entries(elements as Record<string, unknown>)) {
      const cleaned = cleanStyle(style);
      if (cleaned) clean[element] = cleaned;
    }
    if (Object.keys(clean).length > 0) out[page] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Merges `patch` into one element's style. A property set to `undefined`
    goes back to following the book. */
export function withElementStyle(
  styles: ElementStyles | undefined,
  page: string,
  element: string,
  patch: Partial<Record<keyof ElementStyle, ElementStyle[keyof ElementStyle] | undefined>>,
): ElementStyles | undefined {
  const merged: Record<string, unknown> = { ...(styles?.[page]?.[element] ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const elements: PageElementStyles = { ...(styles?.[page] ?? {}) };
  const cleaned = cleanStyle(merged);
  if (cleaned) elements[element] = cleaned;
  else delete elements[element];
  const next: ElementStyles = { ...(styles ?? {}) };
  if (Object.keys(elements).length > 0) next[page] = elements;
  else delete next[page];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Drops the pages that are no longer in the project (a deleted recipe, a
    removed chapter). `livePages` holds every address a page could have now. */
export function pruneElementStyles(
  styles: ElementStyles | undefined,
  livePages: ReadonlySet<string>,
): ElementStyles | undefined {
  if (!styles) return undefined;
  const next: ElementStyles = {};
  for (const [page, elements] of Object.entries(styles)) {
    if (livePages.has(page)) next[page] = elements;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Whether any element anywhere is at a text size other than Normal: on
    recipe cards that is Pro, like the book-wide size. */
export function hasNonNormalTextSize(styles: ElementStyles | undefined): boolean {
  return Object.values(styles ?? {}).some((elements) =>
    Object.values(elements).some((style) => style.textSize !== undefined && style.textSize !== 1),
  );
}

export function recipePageAddress(recipeId: string): string {
  return `recipe:${recipeId}`;
}

export function sectionPageAddress(sectionId: string): string {
  return `section:${sectionId}`;
}

export function ownPageAddress(pageId: string): string {
  return `page:${pageId}`;
}

/** The book's single pages, whose addresses never change. */
export const FIXED_PAGE_ADDRESSES = ["cover", "backCover", "dedication", "toc"] as const;

/** Which page address a sheet slot draws. A chapter's opener and its facing
    caption page share their chapter's address; their elements don't overlap. */
export function pageAddressForSlot(slot: SheetSlot | null | undefined): string | undefined {
  if (!slot) return undefined;
  switch (slot.kind) {
    case "recipe":
      return recipePageAddress(slot.recipeId);
    case "divider":
      return sectionPageAddress(slot.id);
    case "section-photo":
      return sectionPageAddress(slot.sectionId);
    case "cover":
      return slot.side === "front" ? "cover" : slot.side === "back" ? "backCover" : "dedication";
    case "toc":
      return "toc";
    case "blank":
      return slot.pageId ? ownPageAddress(slot.pageId) : undefined;
    default:
      return undefined;
  }
}

/** A recipe page's elements' text sizes, for its pagination budget. */
export function recipeTextSizes(
  styles: ElementStyles | undefined,
  recipeId: string,
): Partial<Record<RecipeElement, FontScale>> | undefined {
  const elements = styles?.[recipePageAddress(recipeId)];
  if (!elements) return undefined;
  const out: Partial<Record<RecipeElement, FontScale>> = {};
  for (const [name, style] of Object.entries(elements)) {
    if (style.textSize !== undefined) out[name as RecipeElement] = style.textSize;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A stable string for memo keys: the same styles always give the same key. */
export function pageStylesKey(elements: PageElementStyles | undefined): string {
  if (!elements) return "";
  return Object.keys(elements)
    .sort()
    .map((name) => `${name}=${elements[name].textSize ?? ""}`)
    .join(",");
}

interface ElementPageValue {
  page?: string;
  elements?: PageElementStyles;
  /** The page is the one being edited in the deck, so words that have no
      field of their own (an added page's lines, a caption, the contents
      entries) can be clicked to bring up the text bar. Never in the export
      or the rail. */
  targets?: boolean;
}

const ElementPageContext = createContext<ElementPageValue>({});

/** Around one page's face: which page it is and its elements' styles. */
export function ElementPageProvider({
  page,
  styles,
  targets = false,
  children,
}: {
  page: string | undefined;
  styles: ElementStyles | undefined;
  targets?: boolean;
  children: ReactNode;
}) {
  return (
    <ElementPageContext.Provider value={{ page, elements: page ? styles?.[page] : undefined, targets }}>
      {children}
    </ElementPageContext.Provider>
  );
}

export interface ElementProps {
  "data-element": string;
  "data-element-page"?: string;
  style?: CSSProperties;
  tabIndex?: number;
}

/**
 * What an element carries: its name and page (which the text bar reads off
 * the field being edited), and its style as CSS. A text size becomes the
 * element's own `--recipe-font-scale`: every size inside it is written against
 * that variable (print.css re-declares the card's role sizes on
 * `[data-element]` so they pick it up there too), so the whole element follows.
 *
 * Returns a function so a face reads the context once and its render helpers
 * can mark any element. `style` is merged in for elements that carry one;
 * `target` marks words the cook can't type into but can still style.
 */
export function useElements(): (name: string, style?: CSSProperties, target?: boolean) => ElementProps {
  const { page, elements, targets } = useContext(ElementPageContext);
  return (name, style, target) => elementProps(page, elements, name, style, Boolean(target && targets));
}

/** The same, for a page drawn outside a face (a chapter's caption page). */
export function elementProps(
  page: string | undefined,
  elements: PageElementStyles | undefined,
  name: string,
  style?: CSSProperties,
  /** Words with no field: focusable on click, so the text bar finds them. */
  target = false,
): ElementProps {
  const size = elements?.[name]?.textSize;
  const merged = size === undefined ? style : ({ ...style, "--recipe-font-scale": size } as CSSProperties);
  return {
    "data-element": name,
    ...(page ? { "data-element-page": page } : {}),
    ...(merged ? { style: merged } : {}),
    ...(target ? { tabIndex: -1 } : {}),
  };
}
