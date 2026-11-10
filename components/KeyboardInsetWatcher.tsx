"use client";

import { useEffect } from "react";
import { readKeyboard } from "@/lib/keyboard";

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

    // `data-keyboard-open` on <html> is for what changes while typing: the
    // phone's bottom bar steps aside, the text bar docks above the keys
    // (lib/keyboard.ts says how it is measured).
    function update() {
      const { open, inset } = readKeyboard();
      document.documentElement.style.setProperty("--rp-keyboard-inset", `${inset}px`);
      document.documentElement.toggleAttribute("data-keyboard-open", open);
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
