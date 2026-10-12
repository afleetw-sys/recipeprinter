---
name: full-audit
description: Read-only bug and performance audit of RecipePrinter, focused on the areas where bugs keep coming back. Use when Amelia asks for a full audit, a site audit, a bug hunt, or "find what's broken" before a big push. Optional argument narrows the scope, e.g. "/full-audit print" or "/full-audit cookbook export".
---

# RecipePrinter full audit

A read-only audit. **Do not change any code, tests, data or config, and do not commit, push or deploy.** The only file you create is the report.

**Scope:** if this skill was given an argument (e.g. `print`, `cookbook export`, `mobile`), audit only the matching categories below, plus the Patterns section for those areas. With no argument, audit everything.

## Ground rules

- Read `CLAUDE.md` and every memory file before starting. They record bugs we already fixed, theories we already disproved, and decisions Amelia already made. Don't re-report a disproven theory (e.g. print-page mount cost, autosave fingerprint cost) or re-propose a rejected design.
- **Never load production in a browser** and never let this session appear in PostHog. Use the local dev server (`preview_start`) only.
- **Never trigger a live import.** A local `/api/parse` call bills Amelia's ScraperAPI quota. Use fixtures, stubs (`e2e/stubs`, `e2e/fixtures`) and existing tests instead.
- Don't write to Firestore, Storage or RevenueCat. Sandbox purchases are off limits too unless Amelia says so.
- **Verify before claiming.** Every finding needs a `file:line`, the exact steps or input that triggers it, and how you confirmed it: you reproduced it in the browser, a test or script shows it, or you traced the execution path line by line. Label each one *Confirmed* (reproduced) or *Traced* (read through the code, not reproduced). Don't put guesses in the report. Put them in a short "worth checking" list at the end.
- Reproduce under the condition that triggers the bug, not the empty state: long recipes, many recipes (60 to 150), every theme, both sizes (Full Page and 4x6), front and back, cookbook and recipe-card modes, signed in and signed out, mobile and desktop widths.
- When you find one instance, **check the whole rule**: every theme, every size, every browser, every sheet or dialog. Report it once as one finding and list what's affected.
- You can split the areas across parallel subagents. Each one has to follow these same rules, and you check their findings yourself before they go in the report.

## Step 1: refresh the category list

The categories in Step 3 were built from sessions between 2026-07-10 and 2026-10-12. Before auditing, bring them up to date:

1. Find the newest `docs/audit-*.md` (the date in its name; ignore `audit-status.md`). Use that date as the cutoff, or 2026-10-12 if there is none.
2. Extract Amelia's own messages since the cutoff from the session transcripts in `~/.claude/projects/*recipeprinter*/*.jsonl`. Keep only `type: "user"` records that aren't `isMeta` or `isSidechain`, and skip tool results and system text. Write a short script for this in the scratchpad. Filter to messages that describe something wrong, using the signal words listed in `CLAUDE.md` ("wrong", "broken", "weird", "stuck", "cut off", "used to work", "again", and so on).
3. Do the same for fix commits since the cutoff (`git log --since=<cutoff>`).
4. Add any new recurring area to Step 3 for this run, and say in the report which categories you added or which ones have gone quiet. If a new category has clearly come up more than once, also edit this SKILL.md to add it. That's the only change to this skill you're allowed to make.

## Step 2: compare with the last audit

If there is a previous `docs/audit-*.md`, read it. Every finding you report gets one of these labels:

- **New**: not in the last audit.
- **Still open**: in the last audit and not fixed.
- **Came back**: fixed since the last audit and broken again. Cite the fix commit and, if you can, the commit that broke it. These are the most important findings.

Also list findings from the last audit that are now fixed, one line each.

## Step 3: where bugs keep coming back (audit these first)

Most frequent first. Many were "fixed" more than once. For each one, look for open instances, look for code paths the last fix missed, and say whether a test guards it now.

1. **Card fit, pagination and measurement.** 4x6 backs overflowing before they break, cards that fit and then reflow onto one page (or two) a few seconds later, content cut off "one line too early", "Steps continued" when the steps never started, decorative art and accents clipped, "Add below" cut off on some themes, ingredient column widths that differ between themes, TOCs running off the page. Start with `lib/measureHeights.ts`, `lib/faceMeasure.ts`, `lib/recipeCardLayout.ts`, `lib/tocPagination.ts`, `lib/printGeometry.ts`, `app/print/print.css` and the layout harness (`npm run test:layout`). Remember the harness renders at scale 1.0, so it can't see bugs that only happen at other zoom levels.
2. **Print and export don't match the preview.** Blank first or last pages, the recipe link printing somewhere other than where the preview shows it, UI chrome (Stripe button, topbar) in the print, themes printing blank or with stray lines, an unflipped back face printed without being measured, rasterised art going pixelated. Compare what's on screen with real PDFs from Chromium, WebKit and Firefox (`e2e/print-matches-preview.spec.ts`, `e2e/print-sizing.spec.ts`, the WKWebView and geckodriver setup in memory).
3. **The browser print flow itself.** A second print gets eaten on mobile, Safari's single `print()` per tab, a 20s Safari delay while the network is busy, Chrome freezing or ignoring clicks after the print dialog closes, the spinner disappearing before the dialog opens, "print refused" being logged when print actually worked. Check against `lib/printAttempt`, `lib/printGesture.ts`, `lib/postPrintDialog.ts`, `lib/printErrorRecovery.ts` and the recorded-behaviour rule. Don't guess browser print events.
4. **Cookbook PDF export.** "Renderer didn't respond" or invalid responses, large books (148 recipes, lots of photos) timing out, Lulu/Blurb cover and interior sizes and spine width, blank-page parity around the dedication, TOC and chapter openers (left/right facing), a separate cover file changing how the interior is laid out, and hardcover vs spiral gutters. Look at the render path end to end, timeouts, memory use and image decoding, and the `pdf:stress` script.
5. **Save and persistence integrity.** Autosave creating new copies of a cookbook, identical recipe-card projects saved again and again, "Saved" or "Saving" shown when Firestore never got the write (or "Couldn't save" when it did), saved state lost on refresh, "New cookbook" starting from cached recipes, empty projects being saved, switching between cookbook and recipe cards forking or overwriting a project, signed-out work getting lost, a leave-without-saving dialog that should be gone. Follow every write path in `lib/printSave*.ts`, `lib/printAutosave.ts`, `lib/printProjects.ts`, `lib/queue.ts` and `lib/saveIntent.ts`, including what happens across sign-in redirects on mobile.
6. **Purchases, entitlements and paywall gaps.** An unlock flashing "Print & unlock" before settling, purchases that later show as unpurchased, more unlock records than purchases, coming back from Stripe and getting the print dialog or the upgrade dialog again, users with Pro granted who still can't get in, duplicate RevenueCat customers. Also look for **ways around the paywall**: adding a recipe while another one is loading, multi-recipe links, Paprika/CookPilot multi-select, cookbook preview caps and the free import allowance (`lib/importMeter.ts`, `lib/freeImports.ts`, `lib/purchaseAccess.ts`, `lib/cookbookUnlocks.ts`).
7. **Import outcomes and failure capture.** Imports that succeed but are wrong (so nothing gets captured), failed images, text or URLs that never reach the debug inbox or Storage (this has broken at least four times), placeholder or paywall text stored instead of the real input, HEIC and empty-MIME photos, error messages that don't match the real cause, a loading card that disappears and comes back as a new card instead of turning into the recipe, a failed card shown next to a successful one, "Try another way" going to the SEO page. Remember the parser itself lives in CookPilot. Note parser faults as CookPilot findings, but don't audit or change CookPilot.
8. **State that drifts between components.** The selected thumbnail not matching the focused page, the photo dialog reopening on scroll, overlay buttons that eat clicks (the decorative-theme stacking trap), toolbars that disappear after a choice, book-wide settings and per-page overrides fighting (photo, link, description, notes), `useQueue` instances that never sync with each other, duplicate React keys, hook-order warnings, and stale data after navigating between `/`, `/print`, `/projects` and the account page.
9. **Scroll, snap, zoom and loading flashes.** Snapping twice or overshooting and pulling back (worse in cookbooks), jerky trackpad zoom, chrome that shrinks as Amelia zooms (an accessibility bug, see memory), a theme switch going blank before the new one shows, the empty state or the previous project flashing before the real one loads, a delay before navigating to `/print`.
10. **Mobile layout.** Inconsistent bottom sheets (corner radius, header, close button, sheets sitting behind the footer), z-index fights (toolbar over the account dropdown, dialogs behind the nav), dialogs that don't fit the screen or won't scroll, a first card you can't reach, missing leading padding, iOS focus-zoom and hover-eats-first-tap.
11. **The inline recipe editor.** Enter splitting a line, typing a comma and then a space, the last ingredient vanishing when it becomes a section header, heading → body resetting the step number to 0, "add below" landing in the wrong section, fields that can't be cleared (cook time), a text selection lost when the field gets focus, extra spacing after deleting a section title, "More fields" showing when it shouldn't or missing when it should.
12. **Auth.** "An account already exists" right after creating one, App Check token failures, slow sign-in, redirect sign-in breaking state on mobile. Check against the 2026-09-19 auth audit in memory and say which of its items are still open.
13. **Analytics reliability** (for diagnosis, not code quality). Sessions or purchases missing from PostHog, returning visitors counted as new users, `$direct` attribution, print or import events that misreport what happened. Read the code only. Don't generate events.

## Step 4: patterns behind the bugs

Look for these too, because they're behind most of the categories above:

- **Two code paths for one behaviour** (cookbook vs recipe cards, preview vs print, client vs server render, desktop vs mobile, dev vs prod). Name each pair that has drifted apart.
- **Recent regressions.** Go through the commits since the last audit (or the last ~150) for changes to the areas above and check whether any of them broke an earlier fix. Amelia often notices these as "it used to work".
- **Fixes without a guard.** For every category, say whether a test would fail if the bug came back, and where the cheapest such test would go (per the rules in `CLAUDE.md`). Don't write the tests.

## Step 5: performance

Measure, don't guess. Run the local build and use the Performance API, React profiling, network and console logs. Look at:

- How long it takes to import, preview and print on `/` and `/print` with 1, 20 and 100 recipes, and time to first card.
- How often cards get measured again (e.g. measurers mounting twice per recipe), layout thrash, `ResizeObserver` loops, re-renders on scroll, snap or zoom.
- Firestore reads and writes per session (duplicate reads, autosave frequency, how big a document gets), Storage use (photos stored more than once), and what grows with each user.
- Bundle size and route weight, images that are too big or blurry on the SEO pages, fonts, and third-party scripts loading before first paint.
- Cookbook PDF render time and memory for large books.

If the last audit has numbers, put this run's next to them.

## Step 6: run the checks

`npm run verify`, `npm run test:e2e` and `npm run test:layout`, plus `npm run audit:design-system` and `npm run audit:unlocks` if they're read-only (check each script first). Report any failures as findings. Don't fix them.

## Report

Write the report to `docs/audit-YYYY-MM-DD.md` (today's date). It's the only file you create, and the only file you change apart from the Step 1 category update. Then give Amelia a short summary in chat.

1. **Top 10** fixes ranked by how much they hurt users × how often they happen, one line each. "Came back" findings go near the top.
2. **Category changes**: categories added or gone quiet since the last run.
3. **Findings grouped by category**, plus "New: other". For each one: title, severity (P0 data loss, money or broken core flow / P1 visible and common / P2 polish), New / Still open / Came back, Confirmed or Traced, `file:line`, steps to reproduce, likely cause, and the cheapest test that would guard it.
4. **Fixed since the last audit**, one line each.
5. **Performance**, with measured numbers, how you measured them, and the last run's numbers if there are any.
6. **Drifted code-path pairs.**
7. **Worth checking**: suspicions you couldn't verify, and why.

Plain language, no em dashes. Then stop and wait. Don't start fixing anything until Amelia picks what to fix.
