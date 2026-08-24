/**
 * Where a collapse control sits, measured from the print shell.
 *
 * The tab that brings a folded panel back only exists once the panel — and the
 * arrow you pressed — are gone, so it cannot line itself up against them. It
 * takes this number instead, captured at the moment of the press, and appears
 * at exactly the height the arrow was.
 *
 * Measured rather than written down as a constant: the two arrows sit at
 * different heights (one in the rail's second row, one in the settings panel's
 * heading), and either can move whenever that header's layout changes. A pair
 * of hard-coded offsets would be right today and quietly wrong later.
 */
export function collapseAnchor(button: HTMLElement): number {
  const shell = button.closest(".recipe-print-shell");
  const box = button.getBoundingClientRect();
  const centre = box.top + box.height / 2;
  if (!shell) return centre;
  return centre - shell.getBoundingClientRect().top;
}
