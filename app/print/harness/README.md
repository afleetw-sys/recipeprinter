# Layout measurement harness

Dev-only regression net for the print-card pagination engine (`getRecipeFaces`
+ `RecipeFaceMeasurer`). Built as Phase 0 of the pagination rewrite: it makes
the whole layout combination matrix visible and turns "a change silently broke
another template/size" into a red cell here instead of a production clip.

## Running it

1. `npm run dev`, open `/print/harness` (returns 404 in production).
2. Click **Run all**. It sweeps every fixture recipe across the config matrix,
   settles each with the current engine, then measures the real per-face
   overflow (after fonts load) and checks the invariants.
3. **Download baseline JSON** saves the full per-combo result.

The sweep runs in a small sliding window (`BATCH_SIZE`) because each
`RecipeFaceMeasurer` runs a synchronous settle loop — mounting a whole recipe's
combos at once livelocks React's effect flush. Advancement is event-driven
(each measurement result advances the window) so it survives background-tab
timer throttling; `window.__harnessStep()` is a manual pump, and
`window.__layoutHarness` exposes `{ summary, inv1Failures, timedOut, dump() }`
for scripted capture.

## The matrix

`SIZES × TEMPLATES × photo × source-url` per recipe. `doubleSided` is
deliberately excluded — it only affects how faces pair onto physical sheets,
never how a recipe splits into faces, so it can't change any overflow verdict.

## Invariants

- **INV-1 no clip** — every settled face's measured overflow ≤ 1px. The core
  "nothing falls off the card" property.
- **INV-2 complete** — every item appears exactly once, in order.
- **INV-3 no empty face** — no non-first face is blank.
- **INV-4 order** — all ingredients precede all instructions in the flow.
- **INV-6 no flash** — the first-paint guess (`getRecipeFaces`) already matches
  the settled result, i.e. the user sees no visible correction/reflow.
- **timedOut** — the current engine never settled this combo (a hang /
  oscillation). Recorded so one bad combo can't stall the sweep.

(INV-5 determinism — run twice, identical output — is a planned addition.)

## Files

- `lib/__fixtures__/harnessRecipes.ts` — the boundary-recipe corpus.
- `lib/__fixtures__/layout-baseline.json` — the captured baseline this was
  first measured against (see the history below).
- `lib/__fixtures__/layout-after-phase1.json` — the same sweep after the
  phase-1 engine work.
- `lib/faceMeasure.ts` — the shared overflow/invariant primitives, used by both
  the live corrector and this harness so both measure identically. That sharing
  is the point: a corrector that measured a label differently from the harness
  would make every verdict here meaningless.

## Current engine (measured 2026-09-11)

**816 combos: 816 pass INV-1..4. Zero clips, zero incomplete, zero empty-face,
zero out-of-order, zero timed out.** 225 flash (INV-6), 2 underfill (INV-7).

Run twice on the same commit — once with the shared-`labelHeightPx` change and
once without — and every counter matched, including the two non-zero ones.

## History

The numbers below are why the engine was worked on; keep them for the shape of
the problem, not as a current reading. The matrix has also changed since (1024
combos then, 816 now), so the totals are not directly comparable.

**2026-07-21, first capture** — 1024 combos: 913 pass, 111 clip, split 107
repackable + 4 oversized, 339 flash. Clips were 6x4-dominated (88 of 111), worst
with photo *and* source-url both on; the salmon fixture on 6x4 overflowed up to
~128px. The 4 oversized were the giant-single-step fixture on 6x4 pantry.

An earlier reading of 205 clips was wrong: ~94 were phantom false positives from
`colsOverflowPx` measuring stretched flex wrappers on under-filled faces. Fixed
to measure true content leaves, which also stopped the live corrector falsely
popping content off roomy faces. `layout-baseline.json` is that corrected
capture (913 / 111).

**After the corrector fixes** — 951 pass / 73 clip / 337 flash, no INV-2/3/4
regressions. Two changes in `RecipeFaceMeasurer`: wait for `document.fonts.ready`
before measuring (a production first-load clip/flash), and settle on the best
*fitting* arrangement seen rather than whatever oscillating state the
`MAX_REFLOW_PASSES` clock happened to stop on (this killed the salmon 6x4 clip).

Everything still open at that point — the repackable clips, the oversized
fixtures, and the flashes — has since closed except the flashes, which need the
authoritative-render change so the first-paint guess is never shown.

### Environment gotchas (cost real debugging time)

The browser preview can silently render the harness cards **unstyled** —
`.recipe-print-preview` custom props missing → cards at ~98–240px wide, 16px
font, so every face reports ~0 overflow and the whole sweep falsely passes.
Two causes seen: the pane collapsing to `innerWidth: 0`, and Next dev/HMR
dropping print.css from the route bundle. **Before trusting a run, assert
`getComputedStyle(document.querySelector('.recipe-print-preview'))` resolves
`--recipe-card-min-height` (e.g. `3.75in`) and `window.innerWidth > 0`.** A
dev-server restart + explicit `resize_window` clears both.
