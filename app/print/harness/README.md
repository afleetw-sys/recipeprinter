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
- `lib/__fixtures__/layout-baseline.json` — captured current-engine baseline
  (the regression oracle the rewrite is measured against).
- `lib/faceMeasure.ts` — the shared overflow/invariant primitives, used by both
  the live corrector and this harness so both measure identically.

## Current-engine baseline (captured 2026-07-21)

1024 combos: **913 pass INV-1..4**, **111 clip (INV-1)** — split **107
repackable** (a better packer can fix) + **4 oversized** (a single line taller
than the card; needs smaller type, not pagination) — **339 flash (INV-6)**, 0
incomplete / empty-face / out-of-order / timed-out.

Clips are **6x4-dominated (88 of 111)**, worst with photo **and** source-url
both on (the salmon fixture on 6x4 overflows up to ~128px there). The 4
oversized are the giant-single-step fixture on 6x4 pantry (narrowest column).

Note: an earlier baseline read 205 clips — ~94 were phantom false positives
from `colsOverflowPx` measuring stretched flex wrappers on under-filled faces
(e.g. every `tiny|letter|*|s1`). Fixed to measure true content leaves; that
also stops the live corrector falsely popping content off roomy faces.

`layout-baseline.json` is the reference (913 pass / 111 clip, engine with the
measurement fix but before the corrector fixes).

### After corrector fixes (`layout-after-corrector-fix.json`)

**951 pass / 73 clip** (69 repackable + 4 oversized) / 337 flash — zero INV-2/3/4
regressions. Two fixes in `RecipeFaceMeasurer`: (a) wait for `document.fonts.ready`
before measuring (production first-load clip/flash), (b) settle on the best
*fitting* arrangement seen rather than whatever oscillating state the
`MAX_REFLOW_PASSES` clock stops on (killed the salmon 6x4 128px clip). Still
open: 69 repackable clips (oscillations where no fully-fitting pass is ever
visited), the 4 oversized (need font scaling), and the 337 flashes (need the
authoritative-render change so the guess is never shown).

### Environment gotchas (cost real debugging time)

The browser preview can silently render the harness cards **unstyled** —
`.recipe-print-preview` custom props missing → cards at ~98–240px wide, 16px
font, so every face reports ~0 overflow and the whole sweep falsely passes.
Two causes seen: the pane collapsing to `innerWidth: 0`, and Next dev/HMR
dropping print.css from the route bundle. **Before trusting a run, assert
`getComputedStyle(document.querySelector('.recipe-print-preview'))` resolves
`--recipe-card-min-height` (e.g. `3.75in`) and `window.innerWidth > 0`.** A
dev-server restart + explicit `resize_window` clears both.
