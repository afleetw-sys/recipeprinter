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

## Deployment

Production is the **`recipeprinter-1zf6`** Vercel project (custom domain `recipeprinter.com`). It deploys automatically via Vercel's Git integration on push — do not run `vercel deploy` / `vercel --prod` directly. A fresh checkout with no `.vercel/project.json` link creates a **brand-new Vercel project** instead of targeting the real one (this has already happened multiple times: `recipeprinter`, `recipeprinter-8bvr`, and `recipeprinter-dtap` are stale duplicates from this).

If a CLI deploy is ever truly necessary, run `vercel link` first and select the existing `recipeprinter-1zf6` project. Never accept a prompt to create a new project.

To ship a change: commit and push to the branch Vercel is watching for this project — that's it.
