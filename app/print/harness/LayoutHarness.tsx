"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RecipeCardFace,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  getRecipeFaces,
  type PrintCardSize,
  type RecipeFace,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { RecipeFaceMeasurer } from "@/components/RecipeFaceMeasurer";
import {
  OVERFLOW_TOLERANCE_PX,
  checkPageInvariants,
  faceMeasureDetail,
  type FaceMeasureDetail,
} from "@/lib/faceMeasure";
import { HARNESS_RECIPES, type HarnessRecipe } from "@/lib/__fixtures__/harnessRecipes";
import type { Recipe } from "@/types/recipe";

// ── The config matrix ──────────────────────────────────────────────────────
// Every axis here is one that actually changes the rendered layout, so a
// regression that only shows up in (say) bistro/6x4/photo-on can't hide.
// doubleSided is deliberately absent: it only affects how faces pair onto
// physical sheets, never how a recipe splits into faces, so it can't change
// any clip/overflow verdict.
const SIZES: PrintCardSize[] = ["letter", "card-6x4"];
const TEMPLATES: RecipePrintTemplate[] = RECIPE_PRINT_TEMPLATE_OPTIONS.map((t) => t.id);
const PHOTO_OPTIONS = [false, true];
const SOURCE_URL_OPTIONS = [false, true];

interface Combo {
  id: string;
  recipeId: string;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  hasPhoto: boolean;
  showSourceUrl: boolean;
}

function combosFor(recipe: HarnessRecipe): Combo[] {
  const combos: Combo[] = [];
  for (const size of SIZES) {
    for (const template of TEMPLATES) {
      for (const hasPhoto of PHOTO_OPTIONS) {
        for (const showSourceUrl of SOURCE_URL_OPTIONS) {
          combos.push({
            id: `${recipe.id}|${size}|${template}|p${hasPhoto ? 1 : 0}|s${showSourceUrl ? 1 : 0}`,
            recipeId: recipe.id,
            size,
            template,
            hasPhoto,
            showSourceUrl,
          });
        }
      }
    }
  }
  return combos;
}

type ClipKind = "none" | "repackable" | "oversized";

interface ComboResult {
  combo: Combo;
  guessFaceCount: number;
  settledFaceCount: number;
  guessMaxOverflow: number;
  settledMaxOverflow: number;
  clipKind: ClipKind;
  // INV-1: the settled (final, shown-after-correction) faces don't clip.
  inv1NoClip: boolean;
  // INV-2/3/4: pure structural invariants on the settled pages.
  inv2Complete: boolean;
  inv3NoEmptyFace: boolean;
  inv4Order: boolean;
  // INV-6: first paint already matches the settled result — no visible
  // clip and no face-count jump (the two reported symptoms).
  inv6NoFlash: boolean;
  // INV-7: no face has enough leftover room to hold the next face's first
  // line. Guards the opposite failure from INV-1 — an engine tuned only
  // against clipping happily strands content on a later face and leaves half
  // a card blank, which reads as "the space isn't optimized".
  inv7NoUnderfill: boolean;
  /** Worst avoidable gap in px (slack beyond what the next line needs). */
  worstUnderfillPx: number;
  worstFace?: FaceMeasureDetail;
  settledShape?: string;
  pass: boolean;
  // The current engine never settled/measured this combo within the window
  // timeout — a finding in its own right (a hang or oscillation), recorded so
  // one bad combo can't stall the whole sweep.
  timedOut?: boolean;
}

const round = (n: number) => Math.round(n * 10) / 10;

function maxOverflow(overflows: number[]): number {
  return overflows.reduce((max, o) => Math.max(max, o), Number.NEGATIVE_INFINITY);
}

// Structural equality of two face lists by the item indices each face carries —
// the basis for INV-6 ("no visible correction": the first-paint guess already
// matches what the corrector settles on).
function pagesEqual(
  a: RecipeFace[],
  b: RecipeFace[],
  ingredientIndexOf: (item: RecipeFace["ingredients"][number]) => number,
  instructionIndexOf: (item: RecipeFace["instructions"][number]) => number,
): boolean {
  if (a.length !== b.length) return false;
  const key = (pages: RecipeFace[]) =>
    pages
      .map(
        (p) =>
          `${p.ingredients.map(ingredientIndexOf).join(",")}|${p.instructions.map(instructionIndexOf).join(",")}`,
      )
      .join(";");
  return key(a) === key(b);
}

// ── FaceSetProbe ────────────────────────────────────────────────────────────
// Renders a given list of faces in the exact hidden, fixed-height,
// overflow-clipped context the live corrector uses (`recipe-face-measurer`),
// then measures each face's real overflow. Measurement waits for
// document.fonts.ready — measuring before webfonts load reports the wrong
// heights, which is itself one of the reflow-after-a-few-seconds causes.
function FaceSetProbe({
  recipe,
  size,
  template,
  hasPhoto,
  showSourceUrl,
  pages,
  onMeasured,
}: {
  recipe: Recipe;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  hasPhoto: boolean;
  showSourceUrl: boolean;
  pages: RecipeFace[];
  onMeasured: (details: FaceMeasureDetail[]) => void;
}) {
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const onMeasuredRef = useRef(onMeasured);
  onMeasuredRef.current = onMeasured;
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    let cancelled = false;
    const run = () => {
      if (cancelled || firedRef.current) return;
      firedRef.current = true;
      const details = pages.map((_, i) => {
        const el = cardRefs.current[i];
        return el
          ? faceMeasureDetail(el)
          : {
              overflowPx: 0,
              availableHeightPx: 0,
              tallestItemPx: 0,
              firstItemPx: 0,
              firstItemIsInstruction: false,
              firstItemLabelPx: 0,
              hasIngredients: false,
              hasInstructions: false,
            };
      });
      onMeasuredRef.current(details);
    };
    // A plain timer, not requestAnimationFrame: the preview runs in a
    // backgrounded tab where rAF is paused, which would stall measurement
    // forever. The delay is generous on purpose — each card measures itself
    // (`useWideColumns` picks its two-column split from a hidden probe, then
    // re-renders), and reading geometry before that settles reports a
    // transient layout. This is the harness's ground truth, so it waits well
    // past the card's own settling rather than racing it.
    const schedule = () => setTimeout(run, PROBE_SETTLE_MS);
    if (typeof document !== "undefined" && document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(schedule);
    } else {
      schedule();
    }
    return () => {
      cancelled = true;
    };
  }, [pages]);

  return (
    <div
      aria-hidden
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden", pointerEvents: "none", zIndex: -1 }}
      className={`recipe-print-preview recipe-print-preview--${size} recipe-face-measurer`}
    >
      <div className={`recipe-card-set recipe-template--${template}`}>
        {pages.map((page, i) => (
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[i] = (el?.firstElementChild as HTMLElement | undefined) ?? null;
            }}
          >
            <RecipeCardFace
              recipe={recipe}
              ingredients={page.ingredients}
              instructions={page.instructions}
              side={i === 0 ? "front" : "back"}
              showHeader={i === 0}
              layout={page.layout}
              hasBackFace={pages.length > 1}
              showImage={i === 0 && hasPhoto}
              showSourceUrl={showSourceUrl}
              continued={i > 0}
              contentScale={page.contentScale}
              template={template}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ComboRunner ─────────────────────────────────────────────────────────────
// For one combo: gets the current engine's settled pages (via the real
// RecipeFaceMeasurer), measures both the raw guess and the settled output,
// computes every invariant, and reports one ComboResult.
function ComboRunner({
  combo,
  recipe,
  onResult,
}: {
  combo: Combo;
  recipe: Recipe;
  onResult: (result: ComboResult) => void;
}) {
  const guessPages = useMemo(
    () =>
      getRecipeFaces(recipe, combo.size, {
        hasPhoto: combo.hasPhoto,
        showSourceUrl: combo.showSourceUrl,
        template: combo.template,
      }).pages,
    [recipe, combo.size, combo.hasPhoto, combo.showSourceUrl, combo.template],
  );

  const [settledPages, setSettledPages] = useState<RecipeFace[] | null>(null);
  const reportedRef = useRef(false);

  // Reports once, the moment the settled probe hands back real overflow. INV-6
  // ("no visible correction") is computed structurally — guess vs settled page
  // distributions identical — so it needs no second DOM probe.
  const report = useCallback(
    (settled: RecipeFace[], details: FaceMeasureDetail[]) => {
      if (reportedRef.current) return;
      reportedRef.current = true;

      const invariants = checkPageInvariants(
        settled,
        recipe.ingredients.length,
        recipe.instructions.length,
        (item) => recipe.ingredients.indexOf(item),
        (item) => recipe.instructions.indexOf(item),
      );
      const settledMax = round(maxOverflow(details.map((d) => d.overflowPx)));
      const inv1NoClip = settledMax <= OVERFLOW_TOLERANCE_PX;
      const inv6NoFlash = pagesEqual(
        guessPages,
        settled,
        (item) => recipe.ingredients.indexOf(item),
        (item) => recipe.instructions.indexOf(item),
      );

      // Categorize a clip: if any overflowing face's single tallest line alone
      // exceeds the space that face had, no repacking can fix it (it needs
      // smaller type) — "oversized". Otherwise the overflow is "repackable".
      let clipKind: ClipKind = "none";
      if (!inv1NoClip) {
        clipKind = "repackable";
        for (const d of details) {
          if (d.overflowPx > OVERFLOW_TOLERANCE_PX && d.tallestItemPx > d.availableHeightPx) {
            clipKind = "oversized";
            break;
          }
        }
      }
      const worstFace = details.reduce(
        (worst, d) => (d.overflowPx > worst.overflowPx ? d : worst),
        details[0] ?? {
          overflowPx: 0,
          availableHeightPx: 0,
          tallestItemPx: 0,
          firstItemPx: 0,
          firstItemIsInstruction: false,
          firstItemLabelPx: 0,
          hasIngredients: false,
          hasInstructions: false,
        },
      );

      // INV-7: could face i have taken face i+1's first line? Negative
      // overflow is slack, so `-overflowPx` is the room actually going spare.
      let worstUnderfillPx = 0;
      for (let i = 0; i < details.length - 1; i++) {
        const next = details[i + 1];
        if (!next || next.firstItemPx <= 0) continue;
        const here = details[i];
        // Receiving that line also means printing its section label, unless
        // this face already has that section — the same cost the pull charges
        // (`sectionLabelCostPx`). Ignoring it made the check demand pulls that
        // genuinely don't fit, flagging faces the engine was right to leave be.
        const needsLabel = next.firstItemIsInstruction ? !here.hasInstructions : !here.hasIngredients;
        const cost = next.firstItemPx + (needsLabel ? next.firstItemLabelPx : 0);
        const spare = -here.overflowPx - cost;
        if (spare > worstUnderfillPx) worstUnderfillPx = spare;
      }
      const inv7NoUnderfill = worstUnderfillPx <= UNDERFILL_TOLERANCE_PX;
      const settledShape = settled
        .map(
          (p, i) =>
            `${p.ingredients.length}i/${p.instructions.length}s(${p.layout})@${round(details[i]?.overflowPx ?? 0)}` +
            (p.contentScale && p.contentScale < 1 ? `x${p.contentScale.toFixed(2)}` : ""),
        )
        .join(" · ");

      onResult({
        combo,
        guessFaceCount: guessPages.length,
        settledFaceCount: settled.length,
        guessMaxOverflow: 0,
        settledMaxOverflow: settledMax,
        inv1NoClip,
        inv2Complete: invariants.complete,
        inv3NoEmptyFace: invariants.noEmptyFace,
        inv4Order: invariants.ingredientsBeforeInstructions,
        inv6NoFlash,
        inv7NoUnderfill,
        worstUnderfillPx: round(worstUnderfillPx),
        clipKind,
        worstFace,
        settledShape,
        pass:
          inv1NoClip && invariants.complete && invariants.noEmptyFace && invariants.ingredientsBeforeInstructions,
      });
    },
    [combo, guessPages, recipe, onResult],
  );

  return (
    <>
      <RecipeFaceMeasurer
        recipe={recipe}
        size={combo.size}
        template={combo.template}
        hasPhoto={combo.hasPhoto}
        showSourceUrl={combo.showSourceUrl}
        showDescription
        onSettled={(pages) => setSettledPages((prev) => prev ?? pages)}
      />
      {settledPages && (
        <FaceSetProbe
          recipe={recipe}
          size={combo.size}
          template={combo.template}
          hasPhoto={combo.hasPhoto}
          showSourceUrl={combo.showSourceUrl}
          pages={settledPages}
          onMeasured={(o) => report(settledPages, o)}
        />
      )}
    </>
  );
}

// Only a handful of RecipeFaceMeasurers may be mounted at once: each one runs
// a synchronous useLayoutEffect settle loop, and mounting a whole recipe's 64
// combos together livelocked React's passive-effect flush (the measurement
// probes' effects never ran). A small sliding window keeps the settle cascade
// bounded and lets effects flush between batches.
// Raised from 6 now that the corrector's passes are timer-scheduled rather
// than a synchronous useLayoutEffect cascade — the old value existed because
// mounting many measurers at once starved React's passive-effect flush and the
// probes never ran. Async passes don't livelock, so a wider window is safe and
// keeps the sweep quick despite the per-pass settle delays.
const BATCH_SIZE = 32;
// Real-time budget for a window before its non-reporting combos are recorded
// as timedOut and the sweep moves on. Background-tab timer throttling makes
// this generous.
// Generous because each corrector pass now waits for the card to settle
// (MEASURE_SETTLE_MS), so a many-faced recipe legitimately needs seconds.
const WINDOW_TIMEOUT_MS = 30000;
// How long the probe waits after fonts are ready before reading geometry, so
// each card's own internal column-split measurement has fully settled first.
const PROBE_SETTLE_MS = 80;
// A face may end with this much unused room before it counts as avoidable
// under-fill. This MUST stay above the corrector's `PULL_HYSTERESIS_PX` (12):
// that margin is a deliberate design choice — the pull leaves it unused so it
// can't immediately undo a pop — so flagging anything above 8px made the
// invariant contradict the engine and fail by construction on ~57 combos whose
// only "waste" was that intended margin (all measured 8.6–13.3px). 16px keeps
// real stranding visible (the reported Bourbon case wasted 28px, and a
// half-empty face wastes ~95px) while accepting the anti-oscillation margin,
// which is ~3% of a 6x4 card's height and invisible in print.
const UNDERFILL_TOLERANCE_PX = 16;

interface FlatCombo {
  combo: Combo;
  recipe: Recipe;
  label: string;
}

export function LayoutHarness() {
  // `?only=<recipeId>[,<recipeId>]` narrows the sweep to specific fixtures —
  // re-validating one boundary case after a change is far quicker than
  // re-running all 1024 combos.
  const flatCombos = useMemo<FlatCombo[]>(() => {
    const only =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("only")
        : null;
    const wanted = only ? new Set(only.split(",").map((s) => s.trim())) : null;
    return HARNESS_RECIPES.filter((r) => !wanted || wanted.has(r.id)).flatMap((r) =>
      combosFor(r).map((combo) => ({ combo, recipe: r.recipe, label: r.label })),
    );
  }, []);
  const totalCombos = flatCombos.length;

  // Results accumulate in a ref, not React state: many child callbacks writing
  // to shared state under dev StrictMode's double-invocation dropped commits
  // on the floor. A ref is immune to that, and a poll loop (below) drives the
  // visible UI and advances the sliding window instead.
  const resultsRef = useRef<Map<string, ComboResult>>(new Map());
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const windowStartedAtRef = useRef(0);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [, forceTick] = useState(0);

  const batch = running ? flatCombos.slice(cursor, cursor + BATCH_SIZE) : [];

  // Advancement is event-driven (called from each measurement result) rather
  // than timer-driven: the harness runs in an occluded background tab whose
  // setInterval/setTimeout freeze between interactions, so a timer loop stalls.
  // Reacting to measurement events — which fire while the page is being
  // poked — keeps the sweep moving reliably.
  const advanceIfDone = useCallback(
    (force: boolean) => {
      if (!runningRef.current) return;
      const start = cursorRef.current;
      const win = flatCombos.slice(start, start + BATCH_SIZE);
      if (win.length === 0) return;
      const missing = win.filter((f) => !resultsRef.current.has(f.combo.id));

      if (missing.length > 0) {
        if (!force) return;
        for (const f of missing) {
          resultsRef.current.set(f.combo.id, {
            combo: f.combo,
            guessFaceCount: 0,
            settledFaceCount: 0,
            guessMaxOverflow: 0,
            settledMaxOverflow: 0,
            inv1NoClip: false,
            inv2Complete: false,
            inv3NoEmptyFace: false,
            inv4Order: false,
            inv6NoFlash: false,
            inv7NoUnderfill: false,
            worstUnderfillPx: 0,
            clipKind: "none",
            pass: false,
            timedOut: true,
          });
        }
      }

      const next = start + BATCH_SIZE;
      if (next >= flatCombos.length) {
        runningRef.current = false;
        setRunning(false);
      } else {
        cursorRef.current = next;
        windowStartedAtRef.current = Date.now();
        setCursor(next);
      }
      forceTick((t) => t + 1);
    },
    [flatCombos],
  );

  const handleResult = useCallback(
    (result: ComboResult) => {
      resultsRef.current.set(result.combo.id, result);
      forceTick((t) => t + 1);
      advanceIfDone(false);
    },
    [advanceIfDone],
  );

  // Best-effort timer: refreshes the UI and force-skips a window whose combos
  // never settle (a hang/oscillation in the current engine, recorded as
  // timedOut). Works when the tab is active; `window.__harnessStep` below is
  // the freeze-proof manual fallback the driver poll invokes.
  useEffect(() => {
    if (!running) return;
    runningRef.current = true;
    windowStartedAtRef.current = Date.now();
    const step = () => {
      forceTick((t) => t + 1);
      advanceIfDone(Date.now() - windowStartedAtRef.current > WINDOW_TIMEOUT_MS);
    };
    const iv = setInterval(step, 250);
    (window as unknown as { __harnessStep?: () => void }).__harnessStep = step;
    return () => {
      clearInterval(iv);
      runningRef.current = false;
    };
  }, [running, advanceIfDone]);

  const resultList = Array.from(resultsRef.current.values());
  const complete = resultList.length === totalCombos;

  const summary = {
    total: resultList.length,
    pass: 0,
    inv1: 0,
    inv2: 0,
    inv3: 0,
    inv4: 0,
    inv6: 0,
    timedOut: 0,
    clipRepackable: 0,
    clipOversized: 0,
    inv7: 0,
  };
  for (const r of resultList) {
    if (r.pass) summary.pass += 1;
    if (r.timedOut) summary.timedOut += 1;
    if (!r.inv1NoClip && !r.timedOut) summary.inv1 += 1;
    if (!r.inv2Complete && !r.timedOut) summary.inv2 += 1;
    if (!r.inv3NoEmptyFace && !r.timedOut) summary.inv3 += 1;
    if (!r.inv4Order && !r.timedOut) summary.inv4 += 1;
    if (!r.inv6NoFlash && !r.timedOut) summary.inv6 += 1;
    if (!r.inv7NoUnderfill && !r.timedOut) summary.inv7 += 1;
    if (r.clipKind === "repackable") summary.clipRepackable += 1;
    if (r.clipKind === "oversized") summary.clipOversized += 1;
  }

  const inv1Failures = resultList
    .filter((r) => !r.inv1NoClip && !r.timedOut)
    .sort((a, b) => b.settledMaxOverflow - a.settledMaxOverflow);
  const timedOut = resultList.filter((r) => r.timedOut);

  // Env health guard — the browser preview has twice silently rendered the
  // harness cards unstyled (pane collapsed to width 0, or Next/HMR dropping
  // print.css from the bundle), which makes every face measure ~0 overflow and
  // the whole sweep falsely pass. Refuse to run until the print vars actually
  // resolve, so a broken environment can never masquerade as green.
  const healthRef = useRef<HTMLDivElement | null>(null);
  const [envHealthy, setEnvHealthy] = useState(true);
  // Polls rather than checking once: in dev the route's CSS can land after
  // first paint, so a single check on mount would latch "unhealthy" and — with
  // the Run button disabled — never get re-evaluated, deadlocking the harness.
  // Polling also catches a mid-session CSS drop or viewport collapse.
  useEffect(() => {
    const check = () => {
      const el = healthRef.current;
      const minH = el ? getComputedStyle(el).getPropertyValue("--recipe-card-min-height").trim() : "";
      setEnvHealthy(Boolean(minH) && typeof window !== "undefined" && window.innerWidth > 0);
    };
    check();
    const iv = setInterval(check, 500);
    return () => clearInterval(iv);
  }, []);

  const startRun = () => {
    resultsRef.current.clear();
    cursorRef.current = 0;
    windowStartedAtRef.current = Date.now();
    runningRef.current = true;
    setCursor(0);
    setRunning(true);
  };

  const downloadBaseline = () => {
    const baseline = {
      capturedAt: new Date().toISOString(),
      matrix: { sizes: SIZES, templates: TEMPLATES, photo: PHOTO_OPTIONS, sourceUrl: SOURCE_URL_OPTIONS },
      totalCombos,
      summary,
      results: resultList
        .slice()
        .sort((a, b) => a.combo.id.localeCompare(b.combo.id)),
    };
    const blob = new Blob([JSON.stringify(baseline, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layout-baseline-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Expose the current results on window for the browser tooling to scrape.
  if (typeof window !== "undefined") {
    (window as unknown as { __layoutHarness?: unknown }).__layoutHarness = {
      complete,
      summary,
      inv1Failures: inv1Failures.map((r) => ({
        id: r.combo.id,
        overflowPx: r.settledMaxOverflow,
      })),
      timedOut: timedOut.map((r) => r.combo.id),
      dump: () => ({
        capturedAt: new Date().toISOString(),
        matrix: { sizes: SIZES, templates: TEMPLATES, photo: PHOTO_OPTIONS, sourceUrl: SOURCE_URL_OPTIONS },
        totalCombos,
        summary,
        results: resultList
          .slice()
          .sort((a, b) => a.combo.id.localeCompare(b.combo.id))
          .map((r) => ({
            id: r.combo.id,
            guessFaces: r.guessFaceCount,
            settledFaces: r.settledFaceCount,
            settledOverflowPx: r.settledMaxOverflow,
            inv1NoClip: r.inv1NoClip,
            inv6NoFlash: r.inv6NoFlash,
            inv7NoUnderfill: r.inv7NoUnderfill,
            worstUnderfillPx: r.worstUnderfillPx,
            clipKind: r.clipKind,
            worstFace: r.worstFace,
            settledShape: r.settledShape,
            pass: r.pass,
            timedOut: r.timedOut ?? false,
          })),
      }),
    };
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", overflowY: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Layout measurement harness</h1>
      <p style={{ color: "#555", marginBottom: 16, fontSize: 14 }}>
        {HARNESS_RECIPES.length} recipes × {SIZES.length} sizes × {TEMPLATES.length} templates × photo × source-url ={" "}
        <strong>{totalCombos}</strong> combos. Each is settled with the current engine, then its real per-face
        overflow is measured (after fonts load) to check the invariants.
      </p>

      {/* Hidden probe used only to confirm print.css actually applies. */}
      <div ref={healthRef} className="recipe-print-preview recipe-print-preview--card-6x4" style={{ position: "fixed", visibility: "hidden", pointerEvents: "none" }} aria-hidden />

      {!envHealthy && (
        <div style={{ background: "#fdecea", border: "1px solid #e5b4b4", color: "#b00020", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
          ⚠ Environment not ready: print.css isn’t applied or the viewport is collapsed, so measurements would be invalid.
          Restart the dev server and set an explicit viewport size, then reload.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={startRun} disabled={!envHealthy} style={btnStyle(true)}>
          {running ? "Running…" : "Run all"}
        </button>
        <button onClick={downloadBaseline} disabled={resultList.length === 0} style={btnStyle(false)}>
          Download baseline JSON
        </button>
        <span style={{ fontSize: 14, color: "#333" }}>
          {resultList.length} / {totalCombos} measured
          {running && batch[0] ? ` — measuring "${batch[0].label}"…` : ""}
          {complete ? " — done" : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
        <SummaryCard label="Passing (INV-1..4)" value={`${summary.pass} / ${summary.total}`} good={summary.pass === summary.total} />
        <SummaryCard label="INV-1 clips (settled)" value={summary.inv1} good={summary.inv1 === 0} />
        <SummaryCard label="↳ repackable" value={summary.clipRepackable} good={summary.clipRepackable === 0} />
        <SummaryCard label="↳ oversized (needs scaling)" value={summary.clipOversized} good={summary.clipOversized === 0} />
        <SummaryCard label="INV-2 incomplete" value={summary.inv2} good={summary.inv2 === 0} />
        <SummaryCard label="INV-3 empty face" value={summary.inv3} good={summary.inv3 === 0} />
        <SummaryCard label="INV-4 out of order" value={summary.inv4} good={summary.inv4 === 0} />
        <SummaryCard label="INV-6 flash (guess≠settled)" value={summary.inv6} good={summary.inv6 === 0} />
        <SummaryCard label="INV-7 underfill (wasted space)" value={summary.inv7} good={summary.inv7 === 0} />
        <SummaryCard label="Timed out (never settled)" value={summary.timedOut} good={summary.timedOut === 0} />
      </div>

      {inv1Failures.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#b00020" }}>
            INV-1 failures — combos the current engine clips today ({inv1Failures.length})
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>combo</th>
                <th style={thStyle}>settled overflow px</th>
                <th style={thStyle}>faces (guess→settled)</th>
              </tr>
            </thead>
            <tbody>
              {inv1Failures.map((r) => (
                <tr key={r.combo.id}>
                  <td style={tdStyle}>{r.combo.id}</td>
                  <td style={{ ...tdStyle, color: "#b00020", fontWeight: 600 }}>{r.settledMaxOverflow}</td>
                  <td style={tdStyle}>
                    {r.guessFaceCount} → {r.settledFaceCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mount only the current sliding window of runners so the settle
          cascade stays bounded and probe effects can flush. */}
      {batch.map((f) => (
        <ComboRunner key={f.combo.id} combo={f.combo} recipe={f.recipe} onResult={handleResult} />
      ))}
    </div>
  );
}

function SummaryCard({ label, value, good }: { label: string; value: string | number; good: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${good ? "#c7e0c7" : "#e5b4b4"}`,
        background: good ? "#f2f9f2" : "#fdf1f1",
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: good ? "#1a7a1a" : "#b00020" }}>{value}</div>
    </div>
  );
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 6,
    border: primary ? "none" : "1px solid #ccc",
    background: primary ? "#1479c9" : "#fff",
    color: primary ? "#fff" : "#333",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  };
}

const tableStyle: React.CSSProperties = { borderCollapse: "collapse", fontSize: 13, width: "100%" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #ddd" };
const tdStyle: React.CSSProperties = { padding: "5px 10px", borderBottom: "1px solid #eee", fontFamily: "ui-monospace, monospace" };
