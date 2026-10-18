import { describe, expect, it } from "vitest";
import { organizeFlipProgress } from "./organizeFlip";

describe("organizeFlipProgress", () => {
  // A requestAnimationFrame timestamp is the start of the frame, which can be
  // earlier than the performance.now() taken when the switch began. Read as
  // negative progress, the cubic ease threw the panel the wrong way for a
  // frame: a closing organizer jumped wider before it narrowed.
  it("never runs outside the start and end widths, whenever a frame lands", () => {
    const start = 1000;
    let previous = -Infinity;
    for (let now = start - 120; now <= start + 600; now += 4) {
      const e = organizeFlipProgress(now, start, 460);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
      expect(e).toBeGreaterThanOrEqual(previous);
      previous = e;
    }
    expect(organizeFlipProgress(start + 460, start, 460)).toBe(1);
  });
});
