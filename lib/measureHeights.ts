"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { splitIntoColumns } from "@/lib/recipeCardLayout";

/** The rendered column, and the row that holds the pair — the two elements
    that answer "how wide is a column" once a split has been made. */
const COLUMN_CLASS = "recipe-card__section-groups-column";
const COLUMNS_ROW_CLASS = "recipe-card__section-groups--columns";

/**
 * The gap the two columns sit either side of, for the first pass only.
 *
 * Read off the columns row when it exists. It does not on the very first
 * measurement — the section renders as a single flow until `splitIndex` is
 * set — so fall back to the section's own `column-gap`, which is what this
 * read has always used and is `0` for the templates that do not set one. A
 * gap missed on that first pass costs a few pixels of probe width, and the
 * pass that follows measures the real column and needs no estimate at all.
 */
function columnsGapPx(section: HTMLElement): number {
  const row = section.querySelector<HTMLElement>(`.${COLUMNS_ROW_CLASS}`);
  return parseFloat(getComputedStyle(row ?? section).columnGap) || 0;
}

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

    // Still hidden (e.g. an inactive deck face at `display: none`) — every
    // chunk would measure 0 and produce a degenerate split. Leave `splitIndex`
    // as-is and wait for the resize observer to fire once it's shown.
    if (section.offsetWidth === 0) return;

    /**
     * The width a chunk will actually be laid out at — in CSS pixels, which is
     * the only unit `probe.style.width` can be written in.
     *
     * This used to come from `getBoundingClientRect()`, and that is a different
     * coordinate space: the preview scales the whole page to fit the pane
     * (`.recipe-page-scaler`), so the rect is POST-transform while the inline
     * width we set from it is pre-transform. At the 100% preview zoom that
     * scale is about 0.47, so every chunk was measured in a probe barely half
     * the width of the column it was destined for — a step that prints on one
     * line measured as two or three, and a long one measured taller still.
     *
     * `splitIntoColumns` then balanced those wrong heights. The visible result
     * is the two columns ending nowhere near each other: the long steps were
     * over-weighted, so the first column was handed only a few of them and
     * stopped an inch short, while the short one-liners were under-weighted
     * and piled into the second column until it ran through the footer. That
     * is the "why did step 8 not fit on the left when step 19 fit on the
     * right" — neither column was measured at the width it renders at.
     *
     * Once the split has been made once, the rendered column IS the measure,
     * exactly, including whatever gap and padding the CSS puts between the
     * two. Before that — the first pass, where the section is still one flow —
     * there is nothing to ask, so halve the section and take off the gap the
     * columns are about to have. That estimate is close but not exact, and
     * "close" is not good enough at a wrap boundary: six pixels of probe width
     * is the difference between a step measuring one line and two, which moves
     * the split by an item. So the pass below re-runs against the real column
     * as soon as one exists. It converges rather than oscillates because both
     * columns are `flex: 1 1 0`, so their width does not depend on the split
     * they are given.
     */
    const renderedColumn = section.querySelector<HTMLElement>(`.${COLUMN_CLASS}`);
    const columnWidth = renderedColumn
      ? renderedColumn.offsetWidth
      : (section.offsetWidth - columnsGapPx(section)) / 2;
    probe.style.width = `${columnWidth}px`;

    const heights = itemElRefs.current
      .slice(0, chunkCount)
      .map((el) => el?.getBoundingClientRect().height ?? 0);
    setSplitIndex(splitIntoColumns(heights));
  }, [chunkCount]);

  // `splitIndex` is a dependency so the first split re-runs this against the
  // rendered columns — see the width comment in `measure`. When that second
  // reading agrees with the first, `setSplitIndex` is handed the value it
  // already holds, React bails out of the re-render, and this does not run
  // again.
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
  }, [active, chunkCount, contentKey, measure, splitIndex]);

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
