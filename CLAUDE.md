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

## Every fix comes with a test

There is no QA tester. A test is the only thing that stops a fixed bug coming back, and most past
fixes shipped without one, so the same breakage (blank cookbook pages, clipped cards, one field
clearing another) kept returning in new combinations.

**It's a fix if behaviour was wrong, whatever it's called.** Amelia rarely says "bug". Treat it as
one when she says something is wrong, off, broken, weird, missing, stuck, cut off, in the wrong place,
"doesn't work", "used to work", "why does it…", "it's doing X again"; when she sends a screenshot
or recording of the app misbehaving; when a customer report, PostHog error, monitor failure or red CI
run points at app behaviour; or when you find the defect yourself mid-task. A change of mind about
how something *should* look or read (copy, spacing taste, a new feature) is not a fix.

For every fix:

1. **Write the test first and watch it fail** against the current code, for the reason reported. A
   test that passes before the fix proves nothing.
2. **Test the rule, not just the reported case.** If one theme clipped, check every theme; if
   clearing one field disturbed another, check its neighbours too; if one cookbook combination made a
   stray blank page, loop over the combinations.
3. **Pick the cheapest layer that can actually fail:** a unit test in `lib/` for logic; a jsdom
   `renderHook` / component test for React state; Playwright (`e2e/`) only for what needs a real
   browser (navigation, reloads, sign-in, real layout, printing). Never live imports (they bill
   ScraperAPI) and never production.
4. **Fix, then watch it pass**, and run `npm run verify`.
5. **Say which test you added** in your reply and the commit message.

If a test genuinely can't be written (a real-iOS-only quirk, Safari's native print dialog, a
third-party checkout page), say so plainly in the reply and name the manual check that covers it.
Never skip the test silently.

Don't write tests that add nothing: no assertions on exact copy wording (test *which* message
appears, not its words), no browser test for something a unit test already covers, no snapshot dumps.

## Deployment

Production is the **`recipeprinter-1zf6`** Vercel project (custom domain `recipeprinter.com`). It deploys automatically via Vercel's Git integration on push — do not run `vercel deploy` / `vercel --prod` directly. A fresh checkout with no `.vercel/project.json` link creates a **brand-new Vercel project** instead of targeting the real one (this has already happened multiple times: `recipeprinter`, `recipeprinter-8bvr`, and `recipeprinter-dtap` are stale duplicates from this).

If a CLI deploy is ever truly necessary, run `vercel link` first and select the existing `recipeprinter-1zf6` project. Never accept a prompt to create a new project.

To ship a change: commit and push to the branch Vercel is watching for this project — that's it.
