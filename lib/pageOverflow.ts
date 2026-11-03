"use client";

import { useEffect, useState } from "react";

/**
 * Which of a page's elements don't fit, read off the page as it's drawn.
 *
 * A recipe page fits itself (RecipeFaceMeasurer moves and shrinks its lines).
 * A book's own pages (the covers, the dedication, a chapter opener, the
 * contents, an added page, a caption) don't: their words sit in a themed box
 * and a long title, a big text size or a new font can run past it, which the
 * print clips without a word. Nothing about a page's size can be checked ahead
 * of time once the cook can style its elements freely, so this looks at the
 * page itself, the way a design tool flags text that overflows its frame.
 *
 * An element "doesn't fit" when its text, as laid out, reaches outside a box
 * that clips it: any ancestor whose overflow isn't visible, up to and
 * including the page's card, which always clips at the paper's edge.
 */

/** Room for sub-pixel rounding on a scaled page. */
const TOLERANCE_PX = 1.5;

function clips(style: CSSStyleDeclaration): boolean {
  return style.overflowX !== "visible" || style.overflowY !== "visible";
}

/** The box the element's words actually occupy: their line boxes, not the
    element's own (a full-width heading's box is wider than its words). A
    field being typed in has no text nodes of its own to measure, so it's
    measured as itself. */
function textRect(el: HTMLElement): DOMRect | null {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 ? rect : null;
  }
  if (!el.textContent?.trim()) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 ? rect : null;
}

function outside(inner: DOMRect, outer: DOMRect): boolean {
  return (
    inner.top < outer.top - TOLERANCE_PX ||
    inner.left < outer.left - TOLERANCE_PX ||
    inner.bottom > outer.bottom + TOLERANCE_PX ||
    inner.right > outer.right + TOLERANCE_PX
  );
}

export function elementOverflows(el: HTMLElement, card: HTMLElement): boolean {
  const rect = textRect(el);
  if (!rect) return false;
  for (let node = el.parentElement; node; node = node.parentElement) {
    if ((node === card || clips(getComputedStyle(node))) && outside(rect, node.getBoundingClientRect())) {
      return true;
    }
    if (node === card) break;
  }
  return false;
}

/** The names of the elements on page `address` that don't fit, as drawn in
    `root`. Hidden copies (the other side of a card, an off-screen measurer)
    are skipped: they aren't what the cook is looking at. */
export function overflowingElements(root: ParentNode, address: string): string[] {
  const names = new Set<string>();
  const selector = `[data-element-page="${CSS.escape(address)}"][data-element]`;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (el.closest("[data-preview-hidden='true'], [data-reveal-only='true'], [data-field-prompt]")) continue;
    if (el.matches(".recipe-card__opener-field--empty, .recipe-card__cover-field--empty")) continue;
    if (el.getClientRects().length === 0) continue;
    const card = el.closest(".recipe-card") as HTMLElement | null;
    if (!card) continue;
    if (elementOverflows(el, card)) names.add(el.dataset.element ?? "");
  }
  names.delete("");
  return Array.from(names).sort();
}

/**
 * Watches page `address` inside the element matching `rootSelector` and
 * returns what doesn't fit on it, kept current as the page is edited,
 * restyled, resized or its fonts arrive. `undefined` = nothing to watch.
 */
export function usePageOverflow(address: string | undefined, rootSelector: string): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!address || typeof document === "undefined") {
      setNames([]);
      return;
    }
    let frame = 0;
    let cancelled = false;
    const check = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (cancelled) return;
        const root = document.querySelector(rootSelector);
        const next = root ? overflowingElements(root, address) : [];
        setNames((current) => (current.join("|") === next.join("|") ? current : next));
      });
    };
    check();
    const root = document.querySelector(rootSelector);
    const mutations = new MutationObserver(check);
    if (root) {
      mutations.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    window.addEventListener("resize", check);
    document.fonts?.ready.then(check).catch(() => {});
    // Typing in a field changes its value, not the DOM.
    document.addEventListener("input", check, true);
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      mutations.disconnect();
      window.removeEventListener("resize", check);
      document.removeEventListener("input", check, true);
    };
  }, [address, rootSelector]);
  return names;
}
