# Measuring the face measurer

The three numbers that decide what to do about `RecipeFaceMeasurer`, and how to
get them. Nothing here changes the engine; this is the measurement pass that has
to come first.

## Why this is a hand-run procedure

It has to run in a **visible, focused tab**, and that is not a preference.

The settle loop advances on `setTimeout(tick, STABILITY_POLL_MS)` with
`STABILITY_POLL_MS = 16`. Browsers clamp `setTimeout` in a background tab to
**one second**, measured directly:

| requested | actual, hidden tab |
| --------- | ------------------ |
| 16 ms     | 1000 ms            |

So every poll costs 60x what it was written to cost, and any wall-clock number
taken from a hidden tab is inflated by roughly that much. An automated run in a
headless or backgrounded browser cannot answer the timing question at all — it
can only answer the counting questions below.

## The procedure

1. Build and serve production (`NEXT_DIST_DIR=.next-preview npm run build`, then
   the `recipeprinter-prod` launch config). Dev-server numbers are not
   comparable: no minification, and on-demand compilation lands inside the
   window being measured.
2. Open `/print` with a book already loaded, **in a visible, focused tab**, and
   let it settle.
3. Paste the script below into the console.
4. Call `rpMeasure(10)`, then `rpMeasure(50)`, then `rpMeasure(200)`.

Each call seeds a book of that size, forces a full re-measure by switching the
card size (part of `faceKey`, so every stored face is invalidated), and reports
when the measurer population drains back to zero.

```js
window.rpMeasure = async function (n) {
  const ING = Array.from({ length: 12 }, (_, i) => ({ raw: `${i + 1} cup ingredient number ${i + 1}, prepared` }));
  const STEP = Array.from({ length: 8 }, (_, i) => ({ step: i + 1, text: `Step ${i + 1}: a sentence about the same length as a real instruction, which is what decides how a face breaks.` }));
  sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      id: "m" + i, method: "text", source: "Pasted text", status: "ready",
      title: "Recipe " + (i + 1), addedAt: Date.now(),
      recipe: { title: "Recipe Number " + (i + 1), ingredients: ING, instructions: STEP },
    })),
  ));
  sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: Array.from({ length: n }, (_, i) => "m" + i) }));
  console.log(`Seeded ${n}. Reload /print, let it settle, then call rpWatch().`);
};

window.rpWatch = function () {
  const state = { mounts: 0, peak: 0, startedAt: null, drainedAt: null, longTasks: 0, blockingMs: 0 };
  const seen = new WeakSet();
  const count = () => document.querySelectorAll(".recipe-face-measurer").length;

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) { state.longTasks += 1; state.blockingMs += Math.max(0, e.duration - 50); }
  }).observe({ type: "longtask", buffered: false });

  const obs = new MutationObserver(() => {
    const nodes = document.querySelectorAll(".recipe-face-measurer");
    if (nodes.length > state.peak) state.peak = nodes.length;
    for (const el of nodes) if (!seen.has(el)) { seen.add(el); state.mounts += 1; }
    if (nodes.length > 0 && state.startedAt == null) state.startedAt = performance.now();
    if (nodes.length === 0 && state.startedAt != null && state.drainedAt == null) {
      state.drainedAt = performance.now();
      obs.disconnect();
      const recipes = document.querySelectorAll(".recipe-page-slide").length;
      console.table({
        recipes,
        wallClockMs: Math.round(state.drainedAt - state.startedAt),
        msPerRecipe: +((state.drainedAt - state.startedAt) / recipes).toFixed(1),
        measurerMounts: state.mounts,
        mountsPerRecipe: +(state.mounts / recipes).toFixed(2),
        peakConcurrent: state.peak,
        longTasks: state.longTasks,
        totalBlockingMs: Math.round(state.blockingMs),
      });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Force a full re-measure: card size is part of `faceKey`.
  const trigger = [...document.querySelectorAll("button.select-menu__trigger")][0];
  trigger.click();
  setTimeout(() => {
    const opts = [...document.querySelectorAll(".select-menu__option")];
    (opts.find((b) => !b.className.includes("is-active")) || opts[1]).click();
  }, 200);
  console.log("Watching. Results print when the measurers drain.");
};
```

## What the numbers decide

| Number | If it is… | Then the lever is |
| --- | --- | --- |
| `msPerRecipe` | flat as the book grows | nothing; the cost is per-recipe and small |
| `msPerRecipe` | rising with book size | contention, not the per-recipe loop — look at `MEASURE_WINDOW_SIZE` |
| `mountsPerRecipe` | 1 | the window is advancing cleanly — this is the confirmed baseline, treat anything else as a regression |
| `peakConcurrent` | 8 | `MEASURE_WINDOW_SIZE` is holding |
| `totalBlockingMs` | most of `wallClockMs` | the main thread is the cost, and the poll interval is not |
| `totalBlockingMs` | a small share | the loop is mostly WAITING on its own timers, and the poll schedule is the lever |

That last row is the fork that matters. The loop spends `STABILITY_POLL_MS` per
poll and up to `MAX_STABILITY_POLLS` polls per pass, up to `MAX_SETTLE_PASSES`
passes — all of it idle waiting. If blocking time is a small share of wall clock,
the engine is not slow, it is *patient*, and the fix is scheduling rather than
anything to do with how a card is measured.

## Already established, so don't re-measure these

- **Exactly one measurer mount per recipe.** Confirmed on a 30-recipe book, both
  on a cold load and on a forced re-measure: 30 mounts, 30 distinct recipes,
  none measured twice. The window advancing reuses instances by key rather than
  remounting them, which is what the keys are for.
- **Peak concurrency is 8**, as `MEASURE_WINDOW_SIZE` intends.
- **The `faceKey` cache works.** Switching card size measures the whole book;
  switching straight back costs **zero** re-measures. A configuration visited
  before really is free, exactly as the cache's comment claims.

Those three together say the engine's structure does what it claims. What is
still unmeasured is purely timing: passes and polls per recipe, and wall clock.

## The finding that is still open

**A background tab stalls the loop by roughly 60x.** The settle loop advances on
`setTimeout(tick, 16)`, and a background tab clamps that to 1000ms (measured
above). So a cook who opens a cookbook and switches tabs leaves the Print button
disabled for minutes rather than seconds, and `printLayoutReady` stays false the
whole time.

The harness was deliberately hardened against exactly this — "advancement is
event-driven … so it survives background-tab timer throttling",
`app/print/harness/LayoutHarness.tsx` — and the live measurer was not.

**Do not fix this by swapping the timer for an unclamped scheduler.** The 16ms is
not merely a yield; it is a deliberate gap that lets the card's own re-render
(`useWideColumns` picks its column split from a hidden probe, then re-renders)
land between two geometry reads. Two reads fired back-to-back would agree
trivially and report a card settled that is still moving, which is the stale
height this whole system exists to prevent. Whatever replaces the timer has to
preserve the gap, not just the yield.

Get the timing numbers first. If blocking time turns out to be a small share of
wall clock, the loop is mostly idle-waiting and the schedule is the lever — and
that is the same conclusion the background stall points at, from a second
direction.

## A note on measuring this from outside

Count mounts with ONE `MutationObserver`, stored so it can be disconnected.

An earlier pass at this reported two mounts per recipe and treated it as a real
2x saving. It was not: two observers had been left running against a single
shared counter, each with its own `WeakSet`, so every mount was counted twice.
The engine was doing exactly one. If a number here looks like a suspiciously
round multiple of what the code should do, suspect the instrument first.
