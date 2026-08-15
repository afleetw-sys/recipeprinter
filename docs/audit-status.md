# RecipePrinter — Audit & Decomposition Status

Living status doc for the product-quality audit and the `app/print/page.tsx`
god-file decomposition. Updated 2026-08-13 (branch `cookbook`). Latest work:
god-file decomposition finished (A1) and the first architecture cleanups (A5, A11).

To resume: start a Claude Code session in this repo and say *"continue the
print-page decomposition — see docs/audit-status.md"* (or *"work the audit"*).

---

## ✅ Done (6 commits, latest `939d543`)

**Reliability & data**
- Durable `localStorage` recovery mirror for queue + project meta, plus a
  `pagehide`/`visibilitychange` flush — in-progress cookbooks/cards survive a tab close.
- `deleteSection` off-by-one fixed + 5 unit tests.
- Crash reporting on the print error boundary (PostHog `$exception`).
- `loadPrintProjects` legacy read fault-isolated (a blip can't blank the library).

**Security (S1) — code complete, NOT deployed (launch-gated)**
- RevenueCat webhook (grant/revoke/transfer) + `cookbook_project_id` attribute +
  runbook (`docs/cookbook-unlock-webhook.md`). Deploy the 5-step sequence BEFORE
  `COOKBOOK_ENABLED=true` ships to prod (reminder at the flag + runbook).

**Dead code**
- Deleted `CookbookOrganizeBoard` (+145L CSS), the dead cookbook-print dialog,
  the committed `export-check.pdf`, 8 unfired analytics events, the dead SEO hub
  machinery, and the removed paywall-dialog remnants.

**UX / polish**
- "Uncategorized" chapter → "More Recipes"; menu hover ≠ selected; disabled state
  unified (.5 / default); lazy-load card + full-page spread photos; rail
  thumbnails skip the decoration layer.

---

## 🏗️ God-file decomposition (audit A1) — ✅ DONE

`app/print/page.tsx`: **~5,768 → 3,197 lines (~45% out)**, into 12 new modules:
`lib/printGeometry`, `lib/useRailSelection`, and `components/print/{ScaledPage,
TemplateThumbnail, MobileStructureSheet, photoStyle, ThemePicker,
PrintSetupControls, PrintConfigPanel, PendingImportRows, PageRail, PrintDeck}`.
Config sidebar, rail, and center deck all fully extracted; the `PrintWorkspace`
orchestrator has been collapsed into `PrintPage`.

**Remaining, in order (hardest last):**
1. ✅ **`<PageRail>`** — the left rail `<nav>` (~480 lines, 48 props, `railSelection`
   passed whole). Verbatim body move; `RAIL_SCALE`/thumb constants moved in too.
   Browser-verified: flat-view rail, cookbook view, **drag-reorder, multi-select,
   inline section rename** all work; no console errors.
2. ✅ **`<PrintDeck>`** — the center deck (~870 lines, ~70 props). `renderActiveControls`
   + `renderDeckPage` moved in as internals; `buildSectionPhotoEdit`/photo controls
   passed as props (`buildSectionPhotoEdit` typed via `ComponentProps<typeof
   ScaledPage>["dividerEdit"]`). Browser-verified: flat deck Edit toggle + inline
   edit persist; cookbook spreads, page focus, Edit toggle; no console errors.
3. ✅ **Collapse the orchestrator** — `PrintWorkspace` merged into `PrintPage`; the
   130-line `PrintWorkspaceProps` interface (all identity-passed props) deleted, its
   body's hooks moved in ahead of the loading/empty guards, its JSX inlined at the
   call site. Browser-verified: empty state, loading→loaded, flat deck + Edit,
   cookbook mode; no console errors. (The former-child hooks now run during loading
   too — all are dependency-guarded, so that is a no-op.)

With the god-file split, **A2** (queue vs `items` dual source of truth) became
tractable and is now done — the queue is the sole content owner, `items` a
derived id-list projection. See the Architecture findings below.

**Approach that's working:** verbatim body moves (byte-exact shell extraction for
big regions), pass hook-returns/objects whole to keep bodies unchanged, narrow a
prop only when trivial, let `tsc` enumerate missing props, clean up now-unused
imports after each, **one extraction per commit**, browser-verify behavior each
time. (Skipped `useCookbookEditing` — low value; editing state already lives in
`PrintPage`, not the giant body.)

---

## Open findings

**🔒 Security** — S1 (P1, deploy pending) · S2 anon-Storage uploads unbounded/public
(P2) · S3 parse-route rate limit (P2) · S4 SSRF TOCTOU (P2) · S5 viewCount
unauth-writable (P3) · S6 two firestore.rules for one backend (P2, documented) ·
S7 no security headers (P3).

**🏗️ Architecture** — all worked; A2 now fully done.
- ✅ **A1** god-file (P1 — page.tsx ~5,768→3,197, 12 modules, orchestrator collapsed).
- ✅ **A2** dual source of truth (P1) — the full single-source rewrite is done.
  `useQueue` gained `updateRecipe` (edits drive `commit`, so the hook's React
  state and storage move together); the page's `items` is now a `useMemo`
  projection of an ordered `jobIds: string[] | null` onto the queue's live
  content, so the queue is the sole content owner. The five former `setItems`
  writers edit `jobIds`; the four scattered `createCurrentPrintJob` calls
  collapsed into one persist effect; the dead `updateQueuedRecipe` free function
  was removed. The null/empty/hydration contract is preserved (`jobIds === null`
  → loading). Browser-verified: load, edit, delete, reload hydration, empty state.
- ✅ **A3** three drag impls (P2) — flat rail rewired onto `useRailDrag` (organize-
  mode side effect gated on cookbook mode); `MobileStructureSheet` arrow buttons left.
- ✅ **A4** sections→syncSections cascade (P2) — the third hand-maintained section-field
  list replaced by one `sectionsMetaEqual` helper (order-insensitive, no loop risk).
- ✅ **A5** dual-read 2× reads (P2) — print job seeds from the hydrated queue.
- ✅ **A7** CSS-color audit gap (P2) — the ~4 UI-chrome offenders tokenized
  (`--cp-overlay-hover`/`-strong`, `--cp-surface-muted`, `--cp-card`); print.css
  template art and the off-palette checkmark left (the latter is a color change).
- ✅ **A8** double URL parse (P2) — ImportPanel validates via the shared
  `normalizeImportURL` (was stricter than the pipeline); hostname parsed once in addUrl.
- ✅ **A9** render-time ref assigns (P3) — latestSave/flushOnHide/activeNavIndexReset
  refs published in effects, not during render.
- ✅ **A10** adoption substring match (P3) — verify by exact asset-field Set membership,
  not a JSON substring scan.
- ✅ **A11** readQueue writes on read (P3) — reads no longer rewrite storage; only the
  recovery reseed persists.

**⚡ Performance** — 🟡 **PF1** (P2, PARTIAL) — the "all measurers at once" livelock
is fixed: the print page now mounts at most `MEASURE_WINDOW_SIZE` (8)
`RecipeFaceMeasurer`s, a self-advancing window (each leaves the pool as it settles).
Engine untouched, so pagination invariants hold by construction; verified on 25-
and 60-recipe books (no livelock/stall). The residual O(n²) is the per-settle
whole-book `sheets` repack (each `setMeasuredFaces` gives `measuredFacesFor` a new
identity). Left as-is deliberately: those intermediate layouts aren't displayed
(double-buffer holds until `printLayoutReady`), measurement latency dominates cold
load after windowing, and the obvious coalescing fix (timer/rAF-batched flush) hits
the documented background-tab timer-freeze trap. · ✅ **PF2** rail virtualization —
each thumbnail (~86% of the rail's DOM, plus its own column measurement) now
lazy-mounts via `LazyRailThumb` (IntersectionObserver, 600px overscan) only as its
row nears the viewport, holding a fixed-size empty `.recipe-page-scaler` box until
then so row height + drag/hit geometry are unchanged. Reveal-and-keep, so scrolling
never re-measures. Verified: 60-recipe book initial rail DOM −71%, scroll-reveal,
drag-reorder + cookbook view intact. · ✅ **PF4** whole-book fingerprint — NO code
change: measured it, the `JSON.stringify` change-signal is 0.05ms (10 recipes) /
0.22ms (60) / 0.69ms (200) and already runs at most once per 1.5s debounce settle
(the earlier lazy+debounce pass did the real mitigation). The only "optimization"
left — hashing to shrink the compare — would add save-skipping collision risk to a
data-loss-critical path for a sub-ms gain, a bad trade. Mitigated, closed. · ✅ **PF5**
image compression off-thread — the jank was the canvas resize + `toDataURL` encode,
NOT the HEIC transcode (heic2any already runs libheif in its own worker). Import now
decodes via `createImageBitmap` and encodes via `OffscreenCanvas.convertToBlob`
(both off-thread), feature-gated with the old main-thread `<canvas>` path as the
Safari-&lt;17 fallback; output is format-identical. Verified end-to-end (inject →
compress → parse → recipe added). · ✅ **PF6** account-dropdown projects load cached
per uid (10s fresh window skips the reopen read, shows cached instantly). · ✅ **PF7**
per-load `lastSeenAt` write throttled by a 12h localStorage marker (skips the
read+write transaction entirely when recent). · ✅ **PF8** failed-import data URLs
decoded locally via `atob` instead of `fetch`-ing bytes already in memory. · 🟡 **PF9**
print.css tokenize (PARTIAL) — the two exact-match rail hover backgrounds routed
through `--cp-overlay-hover`; the rest is template/theme art (leave literal) or
chrome with no existing token (modal backdrops, toast pill — would need new
scrim/toast tokens + dark variants, out of scope for P3).

**🐞 Bugs** — B1 private-browsing re-checkout loop (P2) · B2 reconcile not awaited
(P2) · B3 parsed recipe no min-content check (P2) · B5 `/print?ids=` not
URL-addressable (P2) · B6 export can snapshot before paint (P2) · B7 malformed
persisted data crashes the page — now durable via the recovery mirror, add a
shape guard (P3) · B8/B9/B10 getDoc not-found-vs-transient / maxDuration vs fetch
timeout / roundup funnel counting (P3).

**🎛️ UX / missing states** — U1 "Automatically organized" but new book has no
chapters (P2) · M1 stashedCookbook not persisted on save (P2) · M2 no
retry/backoff on save error (P2) · PL1 print "Preparing…" feedback (P2, pairs with
B6) · P3 tail: layout-undo, feedback backdrop-dismiss, dup detection, ghost-button
hover, empty named sections print blank, image-import thumbnails, ready-dialog
closure, build-reveal timer, classifier collisions.

**♿ Accessibility** — AC1 account dropdown no Escape/focus-trap/ARIA (P1, every
page) · AC2 save-status focusable no-op button (P2) · AC3 reduced-motion gaps
(P2) · P3: EmptyState heading, focus-ring contrast (accepted), ready-dialog inline
buttons, SegmentedControl semantics.

**🧹 Analytics / dead code** — AN2 `card_layout_overflow` was removed as dead;
re-add it wired if you want the clip/reflow-bug rate signal (P2) · D5 `shared=1`
still written-but-unread, left as passive pageview analytics (P3).

---

## Suggested order
1. ✅ Finish the god-file — `<PageRail>` → `<PrintDeck>` → collapse the orchestrator. **Done.**
2. ✅ Architecture cleanups — A1, A2, A3, A4, A5, A7, A8, A9, A10, A11 all done.
   Remaining architecture work: only the P3 tails deliberately scoped out above
   (A7 checkmark color, A8 SeoCapture validation mirror, A10 anon-prefix hardening).
3. Deploy S1 (its own sequence, before cookbook launch).
4. Quick P1/P2 wins independent of the refactor: AC1, B1, U1, S2, B7/B8 guards.
5. Perf pass on the decomposed code: PF1 (carefully) + PF2 + B6/PL1.
