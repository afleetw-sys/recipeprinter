# RecipePrinter

## Deployment

Production is the **`recipeprinter-1zf6`** Vercel project (custom domain `recipeprinter.com`). It deploys automatically via Vercel's Git integration on push — do not run `vercel deploy` / `vercel --prod` directly. A fresh checkout with no `.vercel/project.json` link creates a **brand-new Vercel project** instead of targeting the real one (this has already happened multiple times: `recipeprinter`, `recipeprinter-8bvr`, and `recipeprinter-dtap` are stale duplicates from this).

If a CLI deploy is ever truly necessary, run `vercel link` first and select the existing `recipeprinter-1zf6` project. Never accept a prompt to create a new project.

To ship a change: commit and push to the branch Vercel is watching for this project — that's it.
