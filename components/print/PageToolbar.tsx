"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * The floating bar over a deck page, told where it wrapped.
 *
 * The bar wraps rather than scrolls (a scrolling box would clip the Move menu;
 * see `.recipe-page-toolbar`), and its groups are ruled apart with a hairline on
 * their left edge. CSS cannot tell which item starts a wrapped row, so a group
 * that fell to the second row kept that hairline and opened the row with a
 * stray vertical line in front of nothing. This marks each such group
 * `data-row-start`, and the bar `data-wrapped`, so the stylesheet can drop the
 * rule there and lay a wrapped bar out on purpose.
 *
 * A group starts a row when its top is at or below the previous group's
 * bottom. Comparing tops alone would not do: items are centred, so a one-line
 * button group beside a two-line hint sits lower in the SAME row.
 */
export function PageToolbar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const mark = () => {
      let prevBottom: number | null = null;
      let wrapped = false;
      for (const child of Array.from(bar.children) as HTMLElement[]) {
        const rowStart = prevBottom !== null && child.offsetTop >= prevBottom - 1;
        child.toggleAttribute("data-row-start", rowStart);
        wrapped ||= rowStart;
        prevBottom = child.offsetTop + child.offsetHeight;
      }
      bar.toggleAttribute("data-wrapped", wrapped);
    };
    mark();
    // Resizes cover the screen and zoom; the mutation watch covers groups
    // appearing and disappearing (the line-kind switch, Done) at the same width.
    const resize = new ResizeObserver(mark);
    resize.observe(bar);
    const mutation = new MutationObserver(mark);
    mutation.observe(bar, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="recipe-page-toolbar">
      {children}
    </div>
  );
}
