"use client";

import { useEffect, type RefObject } from "react";

/**
 * Close a popover when the world moves out from under it.
 *
 * Six menus each had their own copy of this and no two agreed. Some listened
 * on `document`, some on `window`; some captured Escape and some let it bubble
 * into the page's own handler (which, in the rail, cleared the selection the
 * menu was about to act on); only one closed on scroll, though every one of
 * them is anchored to something that scrolls; only one closed on resize.
 *
 * The strict version won, because the failures ran one way: a menu left open
 * beside the thing it no longer points at.
 */
export function useMenuDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  {
    enabled = true,
    /** Menus placed against a live trigger reposition instead of closing. */
    closeOnScroll = true,
  }: { enabled?: boolean; closeOnScroll?: boolean } = {},
) {
  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    // Captured, so closing the menu does not ALSO reach whatever Escape means
    // to the page underneath — in the rail that is "clear the selection", i.e.
    // the thing the menu was opened to act on.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    // Anything scrolling underneath moves what this points at — except the
    // menu's own scroll, when it holds more rows than fit.
    const onScroll = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    if (closeOnScroll) document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
      if (closeOnScroll) document.removeEventListener("scroll", onScroll, true);
    };
  }, [ref, onClose, enabled, closeOnScroll]);
}
