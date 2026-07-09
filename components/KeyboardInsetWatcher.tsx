"use client";

import { useEffect } from "react";

/**
 * Keeps `--rp-keyboard-inset` in sync with how much the on-screen keyboard is
 * currently covering, so fixed-position bottom bars can sit above it instead
 * of scrolling away or hiding behind it. `interactive-widget=resizes-content`
 * (set in the root viewport) handles this natively on browsers that support
 * it; this VisualViewport-based fallback covers the rest (older iOS Safari
 * in particular).
 */
export function KeyboardInsetWatcher() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      const inset = Math.max(0, window.innerHeight - viewport!.height - viewport!.offsetTop);
      document.documentElement.style.setProperty("--rp-keyboard-inset", `${inset}px`);
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return null;
}
