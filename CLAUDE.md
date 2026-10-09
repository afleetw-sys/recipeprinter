# RecipePrinter

## The parser lives in CookPilot

There is one recipe parser and it is not in this repo. `app/api/parse/route.ts` asks CookPilot for
every reading of a page:

- `COOKPILOT_RECIPE_PARSER_URL` → CookPilot fetches *and* parses the URL.
- `COOKPILOT_SUPPLIED_HTML_PARSER_URL` → we fetch, CookPilot parses what we hand it.

The second exists because our fetch leaves from Vercel, and a site that refuses Google Cloud will
often serve us — that fetch is the one thing this route genuinely has that CookPilot does not. The
*reading* was never ours to do. Until 2026-09-11 this route carried its own JSON-LD-only extraction
(`lib/schemaRecipe.ts`) and its own copy of the wall classifier (`lib/server/botWall.ts`), both now
deleted. They had silently drifted apart from CookPilot's: ours could read `application/json`
framework payloads that CookPilot could not, and CookPilot's had a 402 rule ours never got — so each
side was failing pages the other would have imported. Both capabilities now live in the shared parser.

**Do not add a parser here.** If a page fails to import, fix it in CookPilot's
`functions/src/recipe/`, where the parity corpus covers it, and redeploy those functions. A fix made
in this repo only helps this repo, and only until it drifts.

## Fixes get a test; features don't

There is no QA tester. A test is the only thing that stops a fixed bug coming back, and most past
fixes shipped without one, so the same breakage (blank cookbook pages, clipped cards, one field
clearing another) kept returning in new combinations.

**New features, redesigns and copy get no new tests.** Not a unit test for the new helper, not a
component test, not a Playwright spec. If a feature breaks later, that break is a fix and gets its
test then. Adjust existing tests a feature changes, and run them, but don't add to them. The only
exception: Amelia asks for one.

**It's a fix if behaviour was wrong, whatever it's called.** Amelia rarely says "bug". Treat it as
one when she says something is wrong, off, broken, weird, missing, stuck, cut off, in the wrong place,
"doesn't work", "used to work", "why does it…", "it's doing X again"; when she sends a screenshot
or recording of the app misbehaving; when a customer report, PostHog error, monitor failure or red CI
run points at app behaviour; or when you find the defect yourself mid-task. A change of mind about
how something *should* look or read (copy, spacing taste, a new feature) is not a fix. A bug you
notice inside a feature you are building right now is not a fix either: it never shipped.

For every fix:

1. **One test, at one layer.** The cheapest layer that can actually fail: a unit test in `lib/` for
   logic; a jsdom `renderHook` / component test for React state; Playwright (`e2e/`) only for what
   needs a real browser (navigation, reloads, sign-in, real layout, printing). Not the same bug at
   two layers. Never live imports (they bill ScraperAPI) and never production.
2. **Write it first and watch it fail** against the current code, for the reason reported. A test
   that passes before the fix proves nothing.
3. **Cover the rule, not just the reported case**, inside that one test: if one theme clipped, loop
   over the themes in the same test rather than adding one per theme.
4. **Fix, then watch it pass**, and run `npm run verify`.
5. **Say which test you added** in your reply and the commit message.

If a test genuinely can't be written (a real-iOS-only quirk, Safari's native print dialog, a
third-party checkout page), say so plainly in the reply and name the manual check that covers it.
Never skip the test silently.

Don't write tests that add nothing: no assertions on exact copy wording (test *which* message
appears, not its words), no browser test for something a unit test already covers, no snapshot dumps,
no tests for the parts of a commit that weren't the fix.

## Print runs on recorded browser behaviour, not guesses

The Print button (`lib/printAttempt.ts`) has one rule for every browser, and every part of it is
there because a recording of a real browser needs it (`lib/printRecordings.ts`). Before October
2026 it was 46 patches in five weeks, each a guess about one browser's print events, and the guesses
kept being wrong.

- **Never reason about how a browser prints; record it.** Serve a probe page that logs `print()`'s
  return time and `beforeprint`/`afterprint`/`blur`/`focus` without network calls mid-print, press
  Print, read the log. Add the result to `lib/printRecordings.ts` with where it came from.
- **Where to record:** iPhone Safari in the iOS Simulator; iPhone app print bridges (Firefox,
  Chrome, DuckDuckGo, Brave, the Google app's broken one) with `tools/ios-print-harness/run.sh`;
  Android Chrome, Samsung Internet and Firefox on the Pixel emulator (`~/Library/Android/sdk`, AVD
  `rp-pixel`, Play Store signed in); Mac Safari and Chrome by asking Amelia to run the probe.
  Closed-source app browsers only on a real phone, via `/print-check`.
- **A Print change ships only when** `lib/printAttempt.test.ts` passes (it replays every recording)
  and the change has been pressed on the real `/print` page in the simulator and emulator. Load a
  deck with a hand-off link (`/print?handoff=1#rp=…`, see `lib/printHandoff.ts`), never by
  importing (imports bill ScraperAPI).
- **A rule no recording needs gets deleted, not kept "just in case".** If a new rule is needed,
  the recording that needs it goes in first and fails without it.
- One `print_attempt` event per press is the only print telemetry. It must never change what the
  button does.

## Deployment

Production is the **`recipeprinter-1zf6`** Vercel project (custom domain `recipeprinter.com`). It deploys automatically via Vercel's Git integration on push — do not run `vercel deploy` / `vercel --prod` directly. A fresh checkout with no `.vercel/project.json` link creates a **brand-new Vercel project** instead of targeting the real one (this has already happened multiple times: `recipeprinter`, `recipeprinter-8bvr`, and `recipeprinter-dtap` are stale duplicates from this).

If a CLI deploy is ever truly necessary, run `vercel link` first and select the existing `recipeprinter-1zf6` project. Never accept a prompt to create a new project.

To ship a change: commit and push to the branch Vercel is watching for this project — that's it.
