"use client";

import { useLayoutEffect, useState } from "react";

/** Space kept between neighbours in the phone bar, so nothing touches. */
const BREATHING_ROOM = 8;

/**
 * Whether undo and redo should fold into the phone bar's "⋯" menu, measured
 * rather than guessed (Amelia, 2026-11-13: "when needed undo and redo should
 * be able to go into the three dots more menu if size requires").
 *
 * What fills the bar changes with the cook and the moment: the page count in
 * the middle ("1 page", "12 pages"), the upgrade crown only before Pro, a
 * failed save's Retry, and a browser zoom that shrinks the width in CSS
 * pixels. So no breakpoint can say when it's full. This watches the bar and
 * steps down only as far as it has to: the centred page count first moves off
 * centre into the row (so it never runs into the "⋯"), and undo and redo fold
 * only when even that row is too wide.
 *
 * Undo and redo are hidden by CSS while folded (`data-history-folded` on the
 * bar), not unmounted, and their width is remembered from when they were last
 * shown, so the check for unfolding again uses their real size.
 *
 * Returns a callback ref for the bar, not a ref object: the bar is not in the
 * deck's first render, and an effect keyed on a ref object never hears that it
 * arrived.
 */
export interface TopbarFit {
  /** The page count leaves the centre and sits in the row (`data-count-in-flow`). */
  countInFlow: boolean;
  /** Undo and redo are in the "⋯" menu (`data-history-folded`). */
  folded: boolean;
}

export function useHistoryFold(): [TopbarFit, (bar: HTMLElement | null) => void] {
  const [layout, setLayoutState] = useState<TopbarFit>({ countInFlow: false, folded: false });
  const [bar, setBar] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!bar || typeof ResizeObserver === "undefined") return;
    let historyWidth = 0;
    const setLayout = (next: TopbarFit) =>
      setLayoutState((prev) =>
        prev.countInFlow === next.countInFlow && prev.folded === next.folded ? prev : next,
      );

    const measure = () => {
      const start = bar.querySelector<HTMLElement>(".recipe-mobile-topbar__start");
      const actions = bar.querySelector<HTMLElement>(".recipe-mobile-topbar__actions");
      const count = bar.querySelector<HTMLElement>(".recipe-mobile-topbar__count");
      const history = start?.querySelector<HTMLElement>(".rp-history-controls");
      if (!start || !actions || !history) return;
      // A bar that isn't drawn (the desktop layout) has nothing to fit.
      if (bar.offsetParent === null && getComputedStyle(bar).position !== "fixed") return;

      const shown = getComputedStyle(history).display !== "none";
      if (shown) historyWidth = history.getBoundingClientRect().width;
      const startGap = parseFloat(getComputedStyle(start).columnGap) || 0;
      const startWidth =
        start.getBoundingClientRect().width + (shown ? 0 : historyWidth + startGap);

      const style = getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const actionsWidth = actions.scrollWidth;
      const countWidth = count?.scrollWidth ?? 0;

      // First choice: the count centred, with room on both sides of it.
      const half = (inner - countWidth) / 2;
      const centredFits =
        countWidth === 0 || (half >= startWidth + BREATHING_ROOM && half >= actionsWidth + BREATHING_ROOM);
      // Second: the count off centre, in the row between the two groups.
      // Moving it costs nothing; hiding undo and redo costs a tap, so they
      // fold only when even that row doesn't fit.
      const rowFits =
        startWidth + countWidth + actionsWidth + BREATHING_ROOM * (countWidth > 0 ? 2 : 1) <= inner;
      setLayout({ countInFlow: !centredFits, folded: !centredFits && !rowFits });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    bar
      .querySelectorAll(
        ".recipe-mobile-topbar__actions, .recipe-mobile-topbar__count, .recipe-mobile-topbar__count > *",
      )
      .forEach((part) => observer.observe(part));
    // The count's badge is mounted into its slot later, by a portal.
    const mutations = new MutationObserver(() => {
      bar.querySelectorAll(".recipe-mobile-topbar__count > *").forEach((part) => observer.observe(part));
      measure();
    });
    mutations.observe(bar, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [bar]);

  return [layout, setBar];
}
