"use client";

import type { FlipRect } from "@/lib/flipTransform";

/**
 * What the front door knew at the moment it handed over.
 *
 * The homepage hands an import to the studio by navigating, and a navigation
 * normally means everything on screen is replaced at once — the importer you
 * were typing into vanishes and a different-looking one appears somewhere else,
 * with no thread between them. Since this is a client-side route change the
 * document survives, so the importer can travel to its new position instead,
 * and the page reads as rearranging around a thing that stayed put.
 *
 * Two facts travel, and both are measurements rather than guesses:
 *
 *  - `importPanel` — where the panel was standing, so the studio's own panel
 *    can start there.
 *  - `studioIsEmpty` — whether there was anything ready to lay out, read
 *    straight out of the queue a moment before leaving. The studio otherwise
 *    cannot answer that until its stores hydrate, which was measured at ~930ms
 *    in a production build, and it spent that second showing a spinner between
 *    the two screens. A second of unrelated screen in the middle of a movement
 *    is not a slow animation, it is a cut — which is why the hand-off read as
 *    not animating at all. With this it can render the destination on the first
 *    paint and let the panel fly into it.
 *
 * Module scope rather than storage on purpose. These are viewport coordinates
 * and a fact about right now: valid across a client-side navigation (same JS
 * context, same viewport, nothing in between that could change the queue),
 * meaningless after a reload — and after a reload there is nothing on screen to
 * have travelled from anyway. A module variable expires exactly when they stop
 * being true.
 *
 * `take` clears; `peek` doesn't. The studio peeks while deciding what to
 * render, which happens on every render, and the empty state takes once when it
 * animates. A later arrival by any other route — a bookmark, the logo, Back —
 * finds nothing and simply renders.
 */
export interface StudioHandoff {
  importPanel: FlipRect | null;
  studioIsEmpty: boolean;
}

let arriving: StudioHandoff | null = null;

export function stashArrivingImporter(handoff: StudioHandoff | null): void {
  arriving = handoff;
}

/** Reads without consuming — safe to call during render. */
export function peekArrivingImporter(): StudioHandoff | null {
  return arriving;
}

export function takeArrivingImporter(): StudioHandoff | null {
  const handoff = arriving;
  arriving = null;
  return handoff;
}
