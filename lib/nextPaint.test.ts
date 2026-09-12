import { afterEach, describe, expect, it, vi } from "vitest";
import { nextPaint } from "@/lib/nextPaint";

// Node env, no jsdom (see vitest.config.ts), so the two globals this reads are
// installed by hand — the same approach lib/idb.test.ts takes to `window`.

type Frame = () => void;

/** A visible document whose frames only run when this test says so. */
function visibleDocument() {
  const frames: Frame[] = [];
  (globalThis as { document?: unknown }).document = { visibilityState: "visible" };
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: Frame) => {
    frames.push(cb);
    return frames.length;
  };
  return {
    /** Run every frame queued so far. Callbacks queued BY those frames land in
        the next call, which is what makes the double-rAF observable. */
    paint() {
      const due = frames.splice(0, frames.length);
      due.forEach((cb) => cb());
    },
    pending: () => frames.length,
  };
}

function hiddenDocument() {
  (globalThis as { document?: unknown }).document = { visibilityState: "hidden" };
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => {
    throw new Error("a hidden tab must never be asked for a frame");
  };
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  vi.useRealTimers();
});

/**
 * Has the promise settled, without waiting on it?
 *
 * Racing it against `Promise.resolve(false)` does NOT work: the loser is
 * already resolved at attach time and wins every race, so an
 * already-settled promise still reads as pending. Watching a flag across a few
 * microtask turns is the version that actually answers the question.
 */
async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  return done;
}

describe("nextPaint", () => {
  it("waits for a frame to be PRESENTED, not merely requested", async () => {
    const doc = visibleDocument();
    const waiting = nextPaint();

    // One frame in: this is the callback that runs before its own paint, so
    // resolving here would defeat the whole purpose.
    doc.paint();
    expect(await settled(waiting)).toBe(false);

    // The second frame is the one that means "it is on screen".
    doc.paint();
    expect(await settled(waiting)).toBe(true);
  });

  /* The trap this module exists to document. A background tab never runs rAF,
     so awaiting a frame there waits forever — it hung a recipe import on the
     front door with the spinner up and going nowhere. */
  it("does not wait at all when the tab is hidden", async () => {
    hiddenDocument();
    // `requestAnimationFrame` throws if touched, so reaching a resolution at
    // all is the assertion: nothing asked for a frame.
    await expect(nextPaint()).resolves.toBeUndefined();
  });

  it("resolves when there is no document to paint into", async () => {
    delete (globalThis as { document?: unknown }).document;
    await expect(nextPaint()).resolves.toBeUndefined();
  });

  it("resolves where requestAnimationFrame does not exist", async () => {
    (globalThis as { document?: unknown }).document = { visibilityState: "visible" };
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    await expect(nextPaint()).resolves.toBeUndefined();
  });

  /* The narrow case the visibility check cannot cover: visible when asked,
     hidden before the frames arrive, so they never come. */
  it("gives up on a frame that never arrives rather than hanging", async () => {
    vi.useFakeTimers();
    const doc = visibleDocument();
    const waiting = nextPaint();

    expect(await settled(waiting)).toBe(false);
    expect(doc.pending()).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(await settled(waiting)).toBe(true);
  });

  it("resolves once, even when the frame lands after the fallback", async () => {
    vi.useFakeTimers();
    const doc = visibleDocument();
    let resolutions = 0;
    const waiting = nextPaint().then(() => { resolutions += 1; });

    await vi.advanceTimersByTimeAsync(50);
    doc.paint();
    doc.paint();
    await waiting;

    expect(resolutions).toBe(1);
  });
});
