"use client";

import { useEffect } from "react";

function isEditable(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.tagName === "INPUT" ||
    node.tagName === "TEXTAREA" ||
    node.tagName === "SELECT" ||
    node.isContentEditable
  );
}

/**
 * Keeps `--rp-keyboard-inset` in sync with how much the on-screen keyboard is
 * currently covering, so fixed-position bottom bars can sit above it instead
 * of scrolling away or hiding behind it. `interactive-widget=resizes-content`
 * (set in the root viewport) handles this natively on browsers that support
 * it; this VisualViewport-based fallback covers the rest (older iOS Safari
 * in particular).
 *
 * `innerHeight - visualViewport.height` isn't unique to the keyboard — it's
 * also nonzero whenever Safari's own address/tab bar is showing, which
 * shrinks and grows continuously as the page is scrolled. Without a focus
 * gate, every scroll tick was read as a keyboard opening and closing, and
 * fixed bottom bars (the mobile print deck's action bar in particular) would
 * visibly jump up over the page and back on every scroll. Only trust the
 * measurement while something editable is actually focused.
 */
export function KeyboardInsetWatcher() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      const inset = isEditable(document.activeElement)
        ? Math.max(0, window.innerHeight - viewport!.height - viewport!.offsetTop)
        : 0;
      document.documentElement.style.setProperty("--rp-keyboard-inset", `${inset}px`);
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return null;
}
