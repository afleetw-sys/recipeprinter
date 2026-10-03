/**
 * How wide the cook has dragged the left rail, kept apart for the page rail
 * and the organizer: one is a column of thumbnails, the other a working
 * surface, and dragging one should not reshape the other.
 *
 * Absent means the layout's own default. The CSS clamps whatever is stored
 * against the window it lands in (see `.recipe-print-page .recipe-print-shell`
 * in app/print/print.css); this only keeps a drag inside sensible bounds.
 */
export type RailWidthMode = "pages" | "organize";
export type RailWidths = Partial<Record<RailWidthMode, number>>;

export const RAIL_MIN_WIDTH: Record<RailWidthMode, number> = { pages: 180, organize: 320 };
/** The preview never gets narrower than this from a drag. */
export const PREVIEW_MIN_WIDTH = 320;
/** One arrow-key press on the divider. */
export const RAIL_KEY_STEP = 16;

const STORAGE_KEY = "rp.railWidths.v1";

export function clampRailWidth(
  width: number,
  mode: RailWidthMode,
  room: { shellWidth: number; panelWidth: number },
): number {
  const min = RAIL_MIN_WIDTH[mode];
  const max = Math.max(min, room.shellWidth - room.panelWidth - PREVIEW_MIN_WIDTH);
  return Math.round(Math.min(max, Math.max(min, width)));
}

export function readRailWidths(): RailWidths {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const widths: RailWidths = {};
    for (const mode of ["pages", "organize"] as const) {
      const value = (parsed as Record<string, unknown>)[mode];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) widths[mode] = value;
    }
    return widths;
  } catch {
    return {};
  }
}

export function writeRailWidths(widths: RailWidths): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // A blocked store only means the width is not remembered next visit.
  }
}
