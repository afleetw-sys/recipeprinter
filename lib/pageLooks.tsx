"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { FONT_SCALES, type FontScale } from "@/lib/fontScale";
import type { SheetSlot } from "@/lib/usePrintSheets";

/**
 * How the cook has styled each page, one record per page whatever its kind.
 *
 * Every page is drawn from its data (a recipe, a cover, a chapter) by its
 * theme. A page look is a layer on top, the way a design tool keeps a style
 * per frame and per element: each page has a stable address (`cover`,
 * `recipe:<id>`, `section:<id>`, `page:<id>`, `toc`), and its `PageLook` holds
 * what the cook changed about it. Today that is only its elements' own styles
 * (`elements`: a recipe's steps, a cover's title, each with a text size).
 *
 * Why one record per page: a page-level property used to mean a new field on
 * whichever type that page happened to be stored in (CoverConfig, Section,
 * RecipePagePlacement, QueueItem.pageContent), and threading it through each
 * one's save, load, export and drawing. Here it is one property on one record,
 * saved and opened with the rest of the book's settings, and every page kind
 * reads it the same way.
 *
 * Addresses, not positions: a recipe's id and an element's name survive
 * reordering, editing and re-importing, which an index would not. A deleted
 * page leaves its record behind, which draws nothing; anything that counts
 * looks (the Pro check) prunes first with `prunePageLooks`.
 *
 * MOVING AN EXISTING FIELD IN (a chapter's photo, a cover's layout): an open
 * tab still running the previous release keeps its code across client-side
 * navigation, reads the field where it used to be and autosaves without
 * this record. So a field that moves keeps being WRITTEN to its old place as
 * well for a release or two, and is READ from here when here has it and from
 * the old place otherwise. Then an older tab's save, which drops `pageLooks`
 * entirely, leaves a book the new code still reads correctly. Only once no
 * older release can be open does the old field stop being written.
 */
export type { PageLook, PageLooks } from "@/types/recipe";
import type { ElementStyle as StoredElementStyle, PageLook, PageLooks } from "@/types/recipe";

/** An element's style as the app draws it: a text size that is one of the
    swept steps. */
export interface ElementStyle extends StoredElementStyle {
  textSize?: FontScale;
}

/** Element name -> its style, for one page. */
export type PageElementStyles = Record<string, ElementStyle>;

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

/** One page's elements as the app draws them. */
export function pageElements(looks: PageLooks | undefined, page: string | undefined): PageElementStyles | undefined {
  return page ? (looks?.[page]?.elements as PageElementStyles | undefined) : undefined;
}

function cleanLook(value: unknown): PageLook | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const look: PageLook = {};
  if (raw.elements && typeof raw.elements === "object") {
    const elements: PageElementStyles = {};
    for (const [name, style] of Object.entries(raw.elements as Record<string, unknown>)) {
      const cleaned = cleanStyle(style);
      if (cleaned) elements[name] = cleaned;
    }
    if (Object.keys(elements).length > 0) look.elements = elements;
  }
  return Object.keys(look).length > 0 ? look : undefined;
}

/** Keeps only what the app can draw: an old or hand-edited document can't put
    an unswept size on a page. Empty looks and empty styles are dropped. */
export function normalizePageLooks(value: unknown): PageLooks | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: PageLooks = {};
  for (const [page, look] of Object.entries(value as Record<string, unknown>)) {
    const cleaned = cleanLook(look);
    if (cleaned) out[page] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Puts one page's look back, dropping it when it's empty. */
function withLook(looks: PageLooks | undefined, page: string, look: PageLook): PageLooks | undefined {
  const next: PageLooks = { ...(looks ?? {}) };
  const cleaned = cleanLook(look);
  if (cleaned) next[page] = cleaned;
  else delete next[page];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Merges `patch` into one element's style. A property set to `undefined`
    goes back to following the book. */
export function withElementStyle(
  looks: PageLooks | undefined,
  page: string,
  element: string,
  patch: { [K in keyof ElementStyle]?: ElementStyle[K] | undefined },
): PageLooks | undefined {
  const look = looks?.[page] ?? {};
  const merged: Record<string, unknown> = { ...(look.elements?.[element] ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return withLook(looks, page, { ...look, elements: { ...look.elements, [element]: merged } });
}

/** Drops the pages that are no longer in the project (a deleted recipe, a
    removed chapter). `livePages` holds every address a page could have now. */
export function prunePageLooks(looks: PageLooks | undefined, livePages: ReadonlySet<string>): PageLooks | undefined {
  if (!looks) return undefined;
  const next: PageLooks = {};
  for (const [page, look] of Object.entries(looks)) {
    if (livePages.has(page)) next[page] = look;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Whether any element anywhere is at a text size other than Normal: on
    recipe cards that is Pro, like the book-wide size. */
export function hasNonNormalTextSize(looks: PageLooks | undefined): boolean {
  return Object.values(looks ?? {}).some((look) =>
    Object.values(look.elements ?? {}).some((style) => style.textSize !== undefined && style.textSize !== 1),
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
  looks: PageLooks | undefined,
  recipeId: string,
): Partial<Record<RecipeElement, FontScale>> | undefined {
  const elements = pageElements(looks, recipePageAddress(recipeId));
  if (!elements) return undefined;
  const out: Partial<Record<RecipeElement, FontScale>> = {};
  for (const [name, style] of Object.entries(elements)) {
    if (style.textSize !== undefined) out[name as RecipeElement] = style.textSize;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The text size a recipe's first page-split guess is made at: the biggest of
    its body elements, so a recipe with Biggest steps is guessed long. The
    measurer corrects the guess either way; a long guess only pulls content
    back, which is cheaper than pushing it out. */
export function recipeBudgetScale(
  bookScale: number,
  sizes: Partial<Record<RecipeElement, FontScale>> | undefined,
): number {
  if (!sizes) return bookScale;
  return Math.max(sizes.ingredients ?? bookScale, sizes.steps ?? bookScale, sizes.notes ?? bookScale);
}

/** The text size the shrink-to-fit floor protects: the smallest of a recipe's
    body elements, so a face holding Smallest steps can never be shrunk below
    the smallest type Normal allows. */
export function recipeFloorScale(
  bookScale: number,
  sizes: Partial<Record<RecipeElement, FontScale>> | undefined,
): number {
  if (!sizes) return bookScale;
  return Math.min(sizes.ingredients ?? bookScale, sizes.steps ?? bookScale, sizes.notes ?? bookScale);
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
  looks,
  targets = false,
  children,
}: {
  page: string | undefined;
  looks: PageLooks | undefined;
  targets?: boolean;
  children: ReactNode;
}) {
  return (
    <ElementPageContext.Provider value={{ page, elements: pageElements(looks, page), targets }}>
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
