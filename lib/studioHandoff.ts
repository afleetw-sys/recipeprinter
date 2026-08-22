"use client";

import type { FlipRect } from "@/lib/flipTransform";

/**
 * Where the importer was standing on the page you just left.
 *
 * The homepage hands an import to the studio by navigating, and a navigation
 * normally means everything on screen is replaced at once — the importer you
 * were typing into vanishes and a different-looking one appears somewhere else,
 * with no thread between them. Since this is a client-side route change the
 * document survives, so the importer can simply travel to its new position
 * instead, and the page reads as rearranging around a thing that stayed put.
 *
 * Module scope rather than storage on purpose. These are viewport coordinates
 * that are only meaningful for the very next paint: valid across a client-side
 * navigation (same JS context, same viewport), meaningless after a reload — and
 * after a reload there is nothing on screen to have travelled from anyway.
 * A module variable expires exactly when the coordinates stop being true.
 *
 * Consume-and-clear, so a later arrival at the studio by any other route — a
 * bookmark, the logo, Back — animates nothing.
 */

let arrivingImporter: FlipRect | null = null;

export function stashArrivingImporter(rect: FlipRect | null): void {
  arrivingImporter = rect;
}

export function takeArrivingImporter(): FlipRect | null {
  const rect = arrivingImporter;
  arrivingImporter = null;
  return rect;
}
