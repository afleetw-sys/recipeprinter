import type { PrintCardSize } from "@/types/recipe";

// Below a phone's own page. These were 280 and 340, which a phone's page
// (about 260-345 wide, 336 and up tall) fell just short of, so the outline a
// phone showed was never page-shaped.
const MIN_WIDTH = 240;
const MIN_HEIGHT: Record<"page" | "card", number> = { page: 310, card: 190 };

/**
 * Whether the deck's empty-state outline has to give up the page's shape.
 *
 * The outline stands in for the page a recipe would make, at the deck's own
 * scale, so it is that page's size. Its title, copy and button do not scale
 * with it, though, and below these sizes they no longer fit inside: only then
 * does it become a small box around the words. `width` and `height` are the
 * page as drawn (its dimensions times the deck scale).
 */
export function emptyOutlineIsCompact(width: number, height: number, cardSize: PrintCardSize): boolean {
  // A 6x4 card shows no ghost columns, so it needs less height.
  return width < MIN_WIDTH || height < MIN_HEIGHT[cardSize === "card-6x4" ? "card" : "page"];
}
