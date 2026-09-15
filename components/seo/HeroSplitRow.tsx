"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * The two-column hero row for `asideAlign: "center-once"` (see that prop's
 * doc comment on `LandingHero`). Measures the left column's height once
 * after mount and nudges the photo down to sit centered against it, then
 * leaves it there.
 *
 * Plain CSS `items-center` can't do this: a Grid row's cross-axis center is
 * the row's own height, `max(left, aside)`, which recomputes on every
 * reflow — so a page whose left column changes height on its own (switching
 * import mode, a validation error appearing) re-litigated the photo's
 * position every time that height did. Measuring once and freezing the
 * result is the tradeoff: a small position change right after the page
 * becomes interactive, in exchange for a photo that never moves again
 * afterward for reasons that have nothing to do with the photo.
 *
 * "Once" is after the fonts settle, not after mount. The site's `next/font`
 * faces (see app/layout.tsx) use `display: "swap"`, so a cold load renders
 * the h1/lede in a fallback face first and swaps to the real one once it
 * downloads — which rewraps that text and changes the left column's height
 * *after* a mount-only measurement already froze against the fallback's
 * (wrong) height. `document.fonts.ready` is what a warm cache/local dev
 * hides: fonts are already loaded, so the swap that matters in production
 * never happens on a second measurement.
 */
export function HeroSplitRow({
  left,
  aside,
  gridClassName,
}: {
  left: ReactNode;
  aside: ReactNode;
  gridClassName: string;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  // Whichever column is shorter gets pushed down by half the difference; the
  // taller one anchors the row at its own top. Which one that is isn't fixed
  // — the photo is often the taller side (a short h1 that fits on one line,
  // the Link tab's one-field capture block) just as often as the text is (a
  // wrapped h1, the Text tab's tall textarea). Pushing only the photo, ever,
  // meant the case where the TEXT was shorter fell through the `Math.max(0,
  // …)` floor and silently stayed top-pinned instead of centering.
  const [offsets, setOffsets] = useState({ left: 0, aside: 0 });

  useLayoutEffect(() => {
    function measure() {
      if (!leftRef.current || !asideRef.current) return;
      // Below `lg` the grid stacks to one column (see gridClassName's own
      // `lg:grid-cols-*`), where a vertical offset between the two has no
      // meaning and would just push one of them down the page.
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        setOffsets({ left: 0, aside: 0 });
        return;
      }
      const diff = leftRef.current.offsetHeight - asideRef.current.offsetHeight;
      setOffsets(diff > 0 ? { left: 0, aside: diff / 2 } : { left: -diff / 2, aside: 0 });
    }
    measure();
    // Re-measure once the swap-in webfonts have actually loaded (a no-op if
    // they already had, e.g. on a warm cache) — see the doc comment above.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className={gridClassName}>
      <div ref={leftRef} style={{ marginTop: offsets.left }}>
        {left}
      </div>
      <div ref={asideRef} style={{ marginTop: offsets.aside }}>
        {aside}
      </div>
    </div>
  );
}
