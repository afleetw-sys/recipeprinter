import { describe, expect, it } from "vitest";
import { emptyOutlineIsCompact } from "@/lib/emptyPageOutline";
import { PAGE_DIMS } from "@/lib/printGeometry";

/** The deck's fit on a phone, as `useDeckScroller` works it out: the page
    takes the width less the deck's side padding, unless the room between the
    deck's top and bottom insets is the tighter limit. */
function phonePage(viewportWidth: number, deckHeight: number, dims: { w: number; h: number }) {
  const scale = Math.min((viewportWidth - 40) / dims.w, (deckHeight * 0.86) / dims.h, (deckHeight - 144) / dims.h);
  return { width: dims.w * scale, height: dims.h * scale };
}

describe("emptyOutlineIsCompact", () => {
  it("keeps the page's shape on a phone, at every size a phone shows it", () => {
    // Deck heights are what is left of the screen under the top bar and above
    // the bottom toolbar, from a short browser window up to a tall phone.
    for (const viewportWidth of [360, 375, 385, 393, 414, 430]) {
      for (const deckHeight of [480, 506, 560, 640]) {
        for (const cardSize of ["letter", "card-6x4"] as const) {
          const { width, height } = phonePage(viewportWidth, deckHeight, PAGE_DIMS[cardSize]);
          expect(
            emptyOutlineIsCompact(width, height, cardSize),
            `${cardSize} at ${viewportWidth}x${deckHeight} (${Math.round(width)}x${Math.round(height)})`,
          ).toBe(false);
        }
      }
    }
  });

  it("gives up the shape only when the words cannot fit inside it", () => {
    expect(emptyOutlineIsCompact(140, 181, "letter")).toBe(true);
    expect(emptyOutlineIsCompact(200, 133, "card-6x4")).toBe(true);
  });
});
