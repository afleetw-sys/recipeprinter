# Import meter runbook

How to deploy, switch on, watch and roll back the free import meter. The design and the reasons
are in [import-meter-plan.md](import-meter-plan.md). This file is the procedure.

**Scope of this rollout: measurement only.** Nobody is ever refused an import. Allowance copy,
the cookbook free size and enforcement are a later, separately approved go-live PR (plan 8.6).

---

## 1. What exists where

| Piece | Repo | State |
|---|---|---|
| `recipe_imported` fields (`importId`, `extra`, `cookbook`, `bookRecipes`, `bookBought`) | RecipePrinter | built (step A) |
| Client wiring: `lib/importMeter.ts`, `lib/freeImports.ts`, `runParse` reserve → parse → settle | RecipePrinter | built (step C), inert |
| `x-rp-import-id` header, forwarded by `/api/parse` as `importId` | RecipePrinter | built (step C) |
| Privacy policy: "Import counts" and its retention line | RecipePrinter | drafted, needs Amelia's approval (B4) |
| `recipePrinterImportMeter` callable, `hasImportId` log line | CookPilot | deployed 2026-10-10 (`5443f1d`, `58cbad2`) and checked; `mode` is off |
| `recipePrinterConfig/importMeter` doc, TTL policy on `recipePrinterImportMeter` | CookPilot / GCP | Amelia's to create (B2) |
| Network check (`recipePrinterMeterNet`, `RECIPEPRINTER_METER_NET_KEY`) | CookPilot | **dropped 2026-10-10**; no IP addresses are processed for the meter |

Nothing reaches production until RecipePrinter is pushed, and pushing is Amelia's call.

---

## 2. The switches

Three switches. All three start off, and each one is safe to flip back on its own.

| Switch | Where | Values | What it does |
|---|---|---|---|
| `IMPORT_METER_DEPLOYED` | `lib/importMeter.ts` (RecipePrinter, needs a deploy) | `true` since 2026-10-10 (not pushed yet), `false` to roll back | `false`: the client never calls the meter, so imports behave exactly as before step C. `true`: free card-mode imports reserve and settle. |
| `mode` | Firestore `recipePrinterConfig/importMeter` (CookPilot, no deploy, read through a 60 s cache) | `"off"`, `"measure"` (`"enforce"` comes with go-live) | `off`: every call answers `{ mode: "off", allowed: true }` and touches no documents. `measure`: records imports, refuses nobody. |
| `IMPORT_ALLOWANCE_LIVE` | `lib/freeImports.ts` (RecipePrinter) | `false` | Gates enforcement and all allowance copy. Only the go-live PR sets it. Even with `mode: "enforce"`, a build where this is `false` can't refuse anyone. |

**Rules:**
- `IMPORT_METER_DEPLOYED` stays `false` until section 4's checks pass against the production
  callable. Calling a function that doesn't exist would cost every free import a failed request.
- `mode` never goes to `measure` before the privacy sentence is live in production.
- Whatever the switches say, the client **fails open**: a meter error, a missing function, or a
  reserve slower than 5 seconds imports normally and records `import_meter_unavailable`.

---

## 3. Deployment sequence

Each step needs the one before it. Steps marked **(Amelia)** need her credentials or her go-ahead.

1. **Approve the privacy wording (B4, Amelia).** The draft is in `app/privacy/page.tsx`
   ("Import counts" in section 4 and its line in section 11).
2. **Go-ahead for the CookPilot deploy (B1, Amelia).** It's the shared production backend.
3. **Check CookPilot's working tree matches production (B3).** CookPilot deploys from its working
   tree, so an older tree rolls live changes back:
   ```bash
   cd /Users/ameliawinger/Desktop/CookPilot && git status --short && firebase functions:list --project cookpilot-bbecb --json
   ```
   Compare each function's `source.storageSource.generation` with the files' mtimes and the last
   commit. Stop if the tree is behind.
4. **No secret to create.** The network check (plan section 7) was dropped on 2026-10-10, so
   the meter needs no secret of its own. The deploy still needs the existing `OPENAI_KEY` and
   `RECIPEPRINTER_PARSER_SECRET`, which are already set.
5. **Create the config doc, off (Amelia, Firebase console).** Collection `recipePrinterConfig`,
   document `importMeter`:
   ```json
   { "mode": "off", "windowDays": 30, "pendingTtlSeconds": 300, "candidateLimits": [5, 10] }
   ```
   A missing doc must also read as `off` in the callable, so this order is a belt-and-braces
   step, not a dependency.
6. **Turn on TTL for the meter collection (B2, Amelia).** Takes effect within about a day;
   deletes are best-effort, usually within 24 hours of `expiresAt`. `gcloud` isn't installed on
   this Mac, so use the console: Google Cloud console → project `cookpilot-bbecb` → Firestore →
   **Time-to-live (TTL)** → **Create policy**, collection group `recipePrinterImportMeter`,
   timestamp field `expiresAt`. The console only offers collections that exist, so create a
   `placeholder` document with a timestamp field `expiresAt` first if the name doesn't come up.
7. **Deploy step B (after B1 and steps 3 to 6).** From the CookPilot main tree (never a
   worktree). Build first: the CLI finds functions in the compiled `lib/`, and this codebase's
   predeploy runs `npm test` but not the build, so without it the new function isn't deployed.
   ```bash
   cd /Users/ameliawinger/Desktop/CookPilot/functions && npm run build && firebase deploy --only functions:recipePrinterImportMeter,functions:recipePrinterParseRecipeFromURL --project cookpilot-bbecb
   ```
   The meter doesn't read or write CookPilot's hourly parse quotas. Those stay exactly as they
   are.
8. **Verify the production callable (section 4).** Still `mode: "off"`.
9. **Flip `IMPORT_METER_DEPLOYED` to `true`** in a one-line RecipePrinter commit. Run
   `npm run verify`. Push only when Amelia says so (push = production deploy). With `mode: "off"`
   this costs one function call per free import and records nothing.
10. **Confirm the privacy sentence is live** on recipeprinter.com/privacy. Read the deployed
    source or use `curl`; never open production in a browser (it would land in PostHog).
11. **Set `mode: "measure"` (Amelia, Firebase console).** Takes effect within 60 seconds.
12. **Day-one checks (section 5)**, then leave it running for at least 30 days so the rolling
    window fills.

---

## 4. Verifying the production callable (before `IMPORT_METER_DEPLOYED = true`)

Never from production in a browser (it would land in PostHog), and never with a recipe import
(those bill ScraperAPI and OpenAI through CookPilot). The checks call the meter directly, with
the same App Check debug-token exchange the production monitor uses (`checks/signin.mjs` in
`recipeprinter-monitor`). They run with Amelia's debug token, so she runs them or sets the env.

1. **It's listed:**
   ```bash
   firebase functions:list --project cookpilot-bbecb | grep recipePrinterImportMeter
   ```
2. **It answers, with App Check.** One command, which reads the web config and the local-dev
   App Check debug token from `.env.local` and prints only the meter's answers:
   ```bash
   node scripts/check-import-meter.mjs
   ```
   Expect `PASS`, with `mode: "off"` until the config doc says `measure`. A cold start can take a
   few seconds. It reserves and then settles one made-up import as a failure, so nothing is ever
   counted.
3. **It wrote nothing.** In the Firebase console, `recipePrinterImportMeter` has no document for
   this check.
4. **Without App Check it's refused.** The same `curl` without the `x-firebase-appcheck` header
   answers 401, not a result.
5. **Fail-open still holds:** `lib/importMeter.test.ts` passes (`npm run verify`).

Only when all five pass does `IMPORT_METER_DEPLOYED` become `true`.

---

## 5. Day-one checks after `measure`

From PostHog, by Amelia or with an API key (B5); never by loading production:
- `meterMs` on `recipe_imported` and `recipe_import_failed`: p50 and p95. If p95 is above about
  1.5 s, consider `minInstances: 1` (decision D4, about $5 to $10 a month).
- `import_meter_unavailable` count against free card-mode `recipe_imported`. Anything above a
  percent or two needs a look.
- `meter_used_30d` values look sane (mostly 0 to a few).

From Google Cloud Logging (`cookpilot-bbecb`):
- the `hasImportId` ratio on `recipePrinterParseRecipeFromURL`. A large share of `false` means
  `/api/parse` is being called from outside the app (decision D5).

---

## 6. Rollback

Fastest first. None of them touches Pro, cookbook purchases or the hourly parse quotas.

1. **Stop measuring, instantly:** set `mode: "off"` in `recipePrinterConfig/importMeter`.
   Within 60 seconds every call returns without reading or writing documents. No deploy.
2. **Stop the client calling at all:** set `IMPORT_METER_DEPLOYED = false`, `npm run verify`,
   and push (Amelia's call). Imports go back to exactly their pre-meter behaviour.
3. **Automatic, always on:** any meter error or a reserve slower than 5 seconds imports normally.
4. **Code:** revert the RecipePrinter commits. The CookPilot function can stay deployed and idle.
5. **Remove the function** only after the client no longer calls it (step 2 live):
   ```bash
   firebase functions:delete recipePrinterImportMeter --project cookpilot-bbecb
   ```
6. **Data:** TTL deletes meter documents 31 days after a subject's last import. Nothing else needs cleaning up. Deleting them sooner is Amelia's
   call, from the console.

If the meter stays off for more than a few days, keep the privacy sentence anyway. It describes
something we may do, and removing and re-adding it is churn.

---

## 7. What this rollout must not change

- **Pro:** the client only reads `hasProEntitlement` to skip the meter. No entitlement is
  written, and every Pro gate (`computeProLocks`, `singleRecipeOnly`) is unchanged.
- **Cookbooks:** cookbook imports never call the meter, including the homepage replay into a
  new book (`meterExempt`). Their only change is extra `recipe_imported` fields.
- **Hourly quotas:** 5 photos an hour (30 for Pro) and 30 links an hour per visitor live in
  CookPilot's parser callables and are untouched. The meter is a separate function and must not
  count toward them. The `/api/parse` IP limit is untouched.
- **Marketing copy:** no allowance wording anywhere until the go-live PR.
