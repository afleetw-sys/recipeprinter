"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** iPhone, iPad and iPod — and an iPad that says it is a Mac, which is what
    iPadOS reports by default. */
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Stops iOS Safari zooming the whole page when a line on a card is tapped.
 *
 * Safari zooms in on any field whose text is under 16px when it takes focus,
 * and a card's text is always under 16px: the page is a print-size sheet scaled
 * to fit the phone, so the field's own font size is the small, unscaled one.
 * Tap a line and the page lurched in and sideways — header clipped off the edge,
 * bottom bar half off-screen — and, if the page was already zoomed, that zoom
 * was thrown away and replaced with Safari's own.
 *
 * The card has its own zoom now (a pinch on it, see `useDeckScroller`), which
 * scales the card and leaves the header and bars where they are. Nothing needs
 * the browser to zoom on focus any more, and nothing should.
 *
 * `maximum-scale=1` is what Safari's focus zoom respects. It has to be in place
 * BEFORE the focus: set from a focus handler it is too late, and a minimum
 * set that way stopped Safari zooming out but never in. That is also why this is
 * a standing setting rather than something held while typing.
 *
 * iOS only, and that matters. Safari ignores `maximum-scale` for the user's own
 * pinch (it has since iOS 10, for accessibility), so nobody loses the ability
 * to zoom the page. Android Chrome honours it, and would lose that ability
 * outright, for a focus zoom it does not do in the first place.
 *
 * Just the print workspace: the marketing pages have no card to tap.
 */
export function NoFocusZoom() {
  const pathname = usePathname();
  const inWorkspace = pathname === "/print" || pathname.startsWith("/print/");

  useEffect(() => {
    if (!inWorkspace || !isIOS()) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.content;
    if (!/maximum-scale/.test(original)) meta.content = `${original}, maximum-scale=1`;
    return () => {
      meta.content = original;
    };
  }, [inWorkspace]);

  return null;
}
