"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { splitIntoColumns } from "@/lib/recipeCardLayout";

export interface WideColumnMeasurement {
  /** Attach to the outer two-column row (its width and gap drive the split). */
  sectionRef: (el: HTMLElement | null) => void;
  /** Attach to the hidden flat probe list used only to measure chunk heights. */
  probeRef: (el: HTMLDivElement | null) => void;
  /** Attach to each chunk's wrapper inside the probe, in chunk order. */
  itemRef: (index: number) => (el: HTMLElement | null) => void;
  /** Index k such that column 1 is chunks[0..k) and column 2 is chunks[k..n) — null until measured. */
  splitIndex: number | null;
}

/**
 * Measures a "wide" section's chunks (a section title glued to its first
 * item counts as one chunk; every other item is its own chunk) at real
 * column width, then computes the balanced-bisection split. Replaces CSS
 * `column-count`/`column-fill: balance`, which is unreliable on iOS's print
 * rendering path (a real WebKit bug — printing doesn't respect multi-column
 * layouts there even though it renders fine on-screen and in desktop print).
 *
 * `contentKey` should be the actual content driving chunk count/height (e.g.
 * the ingredients/instructions array) — re-measuring only when it changes,
 * rather than on every render, avoids catching a mid-transition width during
 * an unrelated re-render (the front/back deck's navigation, for instance) and
 * baking a wrong height in as a stale snapshot.
 *
 * The section this measures can be `display: none` at mount — the print
 * page keeps every face in the DOM but hides whichever ones aren't the
 * active recipe/side on screen (see `[data-preview-hidden]` in globals.css)
 * — where every chunk reports a 0 height. Feeding all-zero heights into
 * `splitIntoColumns` doesn't fail loudly; it ties out at the first item, so
 * column 1 gets exactly one chunk and everything else piles into column 2.
 * A `ResizeObserver` on the section (which fires once when a `display: none`
 * element gets a real box) re-measures the moment it's actually shown,
 * instead of leaving that degenerate split baked in until the content itself
 * changes.
 */
export function useWideColumns(
  active: boolean,
  chunkCount: number,
  contentKey: unknown,
): WideColumnMeasurement {
  const sectionElRef = useRef<HTMLElement | null>(null);
  const probeElRef = useRef<HTMLDivElement | null>(null);
  const itemElRefs = useRef<Array<HTMLElement | null>>([]);
  const [splitIndex, setSplitIndex] = useState<number | null>(null);

  const measure = useCallback(() => {
    const section = sectionElRef.current;
    const probe = probeElRef.current;
    if (!section || !probe) return;

    const fullWidth = section.getBoundingClientRect().width;
    // Still hidden (e.g. an inactive deck face at `display: none`) — every
    // chunk would measure 0 and produce a degenerate split. Leave `splitIndex`
    // as-is and wait for the resize observer to fire once it's shown.
    if (fullWidth === 0) return;

    const gap = parseFloat(getComputedStyle(section).columnGap) || 0;
    const columnWidth = (fullWidth - gap) / 2;
    probe.style.width = `${columnWidth}px`;

    const heights = itemElRefs.current
      .slice(0, chunkCount)
      .map((el) => el?.getBoundingClientRect().height ?? 0);
    setSplitIndex(splitIntoColumns(heights));
  }, [chunkCount]);

  useLayoutEffect(() => {
    if (!active || chunkCount === 0) {
      setSplitIndex(null);
      return;
    }
    measure();

    const section = sectionElRef.current;
    if (!section || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(section);
    return () => observer.disconnect();
  }, [active, chunkCount, contentKey, measure]);

  return {
    sectionRef: (el) => {
      sectionElRef.current = el;
    },
    probeRef: (el) => {
      probeElRef.current = el;
    },
    itemRef: (index) => (el) => {
      itemElRefs.current[index] = el;
    },
    splitIndex,
  };
}
