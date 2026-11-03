"use client";

import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FONT_SCALES, type FontScale } from "@/lib/fontScale";
import type { SheetSlot } from "@/lib/usePrintSheets";

/**
 * Each part of a page can have its own text size: a recipe's title, its
 * ingredients, its steps; a cover's title or author line; a dedication's
 * message. Picked from the floating text bar while that part is being edited.
 *
 * A part's size is one of the same five steps the book-wide Text size offers,
 * and it REPLACES the book's size for that part rather than multiplying it, so
 * nothing ever prints outside the range the layout harness sweeps. A part with
 * no size of its own follows the book.
 *
 * Stored once per project, keyed by page and then by part, so every kind of
 * page uses the same map and no page type needs a field of its own.
 */
export type TextPartSizes = Partial<Record<string, FontScale>>;
export type TextSizes = Record<string, TextPartSizes>;

/** The parts of a recipe page. The pagination budget reads these. */
export type RecipeTextPart =
  "title" | "notes" | "details" | "ingredients" | "steps";

function isFontScale(value: unknown): value is FontScale {
  return (FONT_SCALES as readonly unknown[]).includes(value);
}

/** Drops anything that isn't a page of parts of known sizes, so an old or
    hand-edited document can't put an unswept size on a page. */
export function normalizeTextSizes(value: unknown): TextSizes | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: TextSizes = {};
  for (const [page, parts] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!parts || typeof parts !== "object") continue;
    const clean: TextPartSizes = {};
    for (const [part, size] of Object.entries(
      parts as Record<string, unknown>,
    )) {
      if (isFontScale(size)) clean[part] = size;
    }
    if (Object.keys(clean).length > 0) out[page] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Sets or clears (`undefined` = follow the book) one part's size. */
export function withTextSize(
  sizes: TextSizes | undefined,
  page: string,
  part: string,
  size: FontScale | undefined,
): TextSizes | undefined {
  const parts: TextPartSizes = { ...(sizes?.[page] ?? {}) };
  if (size === undefined) delete parts[part];
  else parts[part] = size;
  const next: TextSizes = { ...(sizes ?? {}) };
  if (Object.keys(parts).length > 0) next[page] = parts;
  else delete next[page];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Whether any part anywhere is at a size other than Normal: on recipe cards
    that is Pro, like the book-wide size. */
export function hasNonNormalTextSize(sizes: TextSizes | undefined): boolean {
  return Object.values(sizes ?? {}).some((parts) =>
    Object.values(parts).some((size) => size !== 1),
  );
}

export function recipeTextPage(recipeId: string): string {
  return `recipe:${recipeId}`;
}

/** Which page of the map a sheet slot reads. A chapter's opener and its facing
    caption page share their chapter's key; their parts don't overlap. */
export function textPageForSlot(
  slot: SheetSlot | null | undefined,
): string | undefined {
  if (!slot) return undefined;
  switch (slot.kind) {
    case "recipe":
      return recipeTextPage(slot.recipeId);
    case "divider":
      return `section:${slot.id}`;
    case "section-photo":
      return `section:${slot.sectionId}`;
    case "cover":
      return slot.side === "front"
        ? "cover"
        : slot.side === "back"
          ? "backCover"
          : "dedication";
    case "toc":
      return "toc";
    case "blank":
      return slot.pageId ? `page:${slot.pageId}` : undefined;
    default:
      return undefined;
  }
}

/** The parts' sizes for a recipe's own pagination budget. */
export function recipePartScales(
  sizes: TextSizes | undefined,
  recipeId: string,
): Partial<Record<RecipeTextPart, FontScale>> | undefined {
  return sizes?.[recipeTextPage(recipeId)] as
    Partial<Record<RecipeTextPart, FontScale>> | undefined;
}

/** A stable string for memo keys: the same sizes always give the same key. */
export function partScalesKey(parts: TextPartSizes | undefined): string {
  if (!parts) return "";
  return Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key]}`)
    .join(",");
}

interface TextPageValue {
  page?: string;
  sizes?: TextPartSizes;
  /** The page is the one being edited in the deck, so words that have no
      field of their own (an added page's lines, a caption, the contents
      entries) can be clicked to bring up the text bar's Size. Never in the
      export or the rail. */
  targets?: boolean;
}

const TextPageContext = createContext<TextPageValue>({});

/** Around one page's face: which page it is and its parts' sizes. */
export function TextPageProvider({
  page,
  sizes,
  targets = false,
  children,
}: {
  page: string | undefined;
  sizes: TextSizes | undefined;
  targets?: boolean;
  children: ReactNode;
}) {
  return (
    <TextPageContext.Provider
      value={{ page, sizes: page ? sizes?.[page] : undefined, targets }}
    >
      {children}
    </TextPageContext.Provider>
  );
}

export interface TextPartProps {
  "data-text-part": string;
  "data-text-page"?: string;
  style?: CSSProperties;
  tabIndex?: number;
}

/**
 * What a part's element carries: its name and page (which the text bar reads
 * off the field being edited), and, when it has a size of its own, that size as
 * the element's `--recipe-font-scale`. Every size inside it is written against
 * that variable (print.css re-declares the card's role sizes on
 * `[data-text-part]` so they pick it up there too), so the whole part follows.
 *
 * Returns a function so a face reads the context once and its render helpers
 * can mark any element. `style` is merged in for elements that carry one;
 * `sizeTarget` marks words the cook can't type into but can still size.
 */
export function useTextParts(): (
  part: string,
  style?: CSSProperties,
  sizeTarget?: boolean,
) => TextPartProps {
  const { page, sizes, targets } = useContext(TextPageContext);
  return (part, style, sizeTarget) =>
    textPartProps(page, sizes, part, style, Boolean(sizeTarget && targets));
}

/** The same, for a page drawn outside a face (a chapter's caption page). */
export function textPartProps(
  page: string | undefined,
  sizes: TextPartSizes | undefined,
  part: string,
  style?: CSSProperties,
  /** Words with no field: focusable on click, so the text bar finds them. */
  sizeTarget = false,
): TextPartProps {
  const size = sizes?.[part];
  const merged =
    size === undefined
      ? style
      : ({ ...style, "--recipe-font-scale": size } as CSSProperties);
  return {
    "data-text-part": part,
    ...(page ? { "data-text-page": page } : {}),
    ...(merged ? { style: merged } : {}),
    ...(sizeTarget ? { tabIndex: -1 } : {}),
  };
}
