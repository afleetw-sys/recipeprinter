// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { scrollDeckTo } from "./useDeckScroller";

/**
 * A smooth jump turns the deck's snapping off and has to keep it off until the
 * scroll lands. Safari has no `scrollend`, so it was turned back on by a 600ms
 * timer instead, and a jump still moving then (a busy or slow device) snapped
 * back to the page it was leaving. That's how a recipe from "Try another way"
 * arrived with the deck still on the recipe above it, in WebKit, under the
 * full e2e run's load (e2e/try-another-way.spec.ts).
 */

afterEach(() => vi.useRealTimers());

/** A deck whose smooth scroll moves `perFrame` px a frame, ~16ms apart. */
function slowDeck(perFrame: number) {
  const deck = document.createElement("div") as HTMLDivElement;
  let top = 0;
  let target = 0;
  Object.defineProperty(deck, "scrollTop", { get: () => top, set: (v: number) => (top = v), configurable: true });
  deck.scrollTo = ((options: ScrollToOptions) => {
    target = options.top ?? top;
    if (options.behavior !== "smooth") top = target;
  }) as typeof deck.scrollTo;
  const frame = () => {
    if (top !== target) top = Math.abs(target - top) <= perFrame ? target : top + Math.sign(target - top) * perFrame;
  };
  return { deck, frame, at: () => top };
}

describe("scrollDeckTo", () => {
  test("snapping stays off until a smooth jump lands, however long it takes, then comes back", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });

    // Fast enough to land inside the old timer, and slow enough to outlast it.
    for (const perFrame of [200, 20]) {
      const { deck, frame, at } = slowDeck(perFrame);
      deck.style.scrollSnapType = "y mandatory";
      scrollDeckTo(deck, { top: 1600, behavior: "smooth" });

      while (at() !== 1600) {
        expect(deck.style.scrollSnapType, `${perFrame}px a frame, at ${at()}`).toBe("none");
        frame();
        vi.advanceTimersByTime(16);
      }
      vi.advanceTimersByTime(500);
      expect(deck.style.scrollSnapType, `${perFrame}px a frame, landed`).toBe("");
    }
  });
});
