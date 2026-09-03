/**
 * Whether a click on a photo surface was a deliberate press on THAT photo, and
 * so should open its dialog.
 *
 * The deck scrolls natively. Scrolling moves a page under a stationary cursor,
 * and the drag guard this replaces compared only CLIENT coordinates — which do
 * not change when the content moves instead of the pointer. So a chapter opener
 * that scrolled under the cursor looked exactly like a perfectly still click on
 * its photo, and any click that arrived then opened the photo editor for a page
 * the cook had never pressed on. Scrolling fast made it likelier, because more
 * pages passed under the pointer.
 *
 * The old guard also failed OPEN: with no recorded press it skipped the check
 * entirely (`if (start && moved > slop) return`), so a click with no press
 * behind it was treated as a clean one.
 *
 * Two things have to hold now, and absence of evidence is a no:
 *
 *  1. the press landed on the SAME photo surface this click did — a press
 *     somewhere else, or none at all, cannot open anything; and
 *  2. the pointer stayed within `slop` between press and click, which is what
 *     still separates a click from dragging a full-page photo to reposition it.
 */
export interface PhotoPress {
  x: number;
  y: number;
  /** The photo surface under the pointer when it went down, if any. */
  surface: unknown;
}

export function isPhotoOpenClick(options: {
  press: PhotoPress | null;
  click: { x: number; y: number; surface: unknown };
  slop: number;
}): boolean {
  const { press, click, slop } = options;

  // Not a photo at all.
  if (!click.surface) return false;
  // No press behind this click: a synthesized or stray click, or one whose
  // press happened before the page scrolled here. Fail closed.
  if (!press) return false;
  // Pressed on something else — including a different photo on another page.
  if (press.surface !== click.surface) return false;

  return Math.hypot(click.x - press.x, click.y - press.y) <= slop;
}
