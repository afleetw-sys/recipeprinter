# Recipe Printer Firebase and commerce inventory

This inventory is the implementation checkpoint for the namespaced migration.

**Rules ARE deployed from this repository.** `firestore.rules` and
`storage.rules` here are the source of truth for the shared `cookpilot-bbecb`
project, and both are supersets that include CookPilot's own matches verbatim
(`users/{uid}/recipes/**` and `recipe-images/{uid}/**`). Deploy with:

```
firebase deploy --only firestore:rules,storage --project cookpilot-bbecb
```

This paragraph used to say the opposite -- that the rules were "owned outside
this repository" and had to be coordinated elsewhere. That was wrong, and the
cost of the error was real: it went unchallenged long enough that a live
privilege-escalation hole and two live unauthenticated-write holes sat
undeployed while the fixes for all three were already committed here. Verified
2026-09-04 by fetching the live rulesets: the deployed Firestore ruleset was
byte-identical to this repo's file, and the deployed Storage ruleset was a
month-stale copy of it.

CookPilot's backend *functions* are still owned outside this repository, and
that half of the original warning stands.

| Area | Current source of truth | New destination | Readers | Writers | Migration and fallback |
| --- | --- | --- | --- | --- | --- |
| Firebase identity | Shared Firebase Auth project | Unchanged | `CookPilotAuth`, RevenueCat identity link | Firebase Auth providers | No user duplication |
| CookPilot recipes | `users/{uid}/recipes/**` | Unchanged | `lib/cookpilotRecipes.ts` | CookPilot | Intentional cross-product read |
| CookPilot membership | `users/{uid}.plusExpiresAt` | Unchanged | Nothing: the member free-template perk was retired 2026-09-20 | CookPilot backend | RecipePrinter no longer reads it. `firestore.rules` still denies client writes to it |
| Recipe Printer profile | Recipe Printer fields on `users/{uid}` | `products/recipePrinter/users/{uid}` | print-page account gates | `claimRecipePrinterFreeTemplate`, administrators | Namespace-first plus legacy merge until backend/backfill completes |
| Admin role | `users/{uid}.recipePrinterAdmin` | namespaced user document | shared-card administration | server/admin only | Backfill; clients cannot write |
| Free template claim | `recipePrinterFreeTemplateGranted*` on `users/{uid}` plus RevenueCat grant | namespaced user document plus RevenueCat entitlement | RevenueCat customer info only | `claimRecipePrinterFreeTemplate` callable | Retired 2026-09-20: the claim UI and client call are gone. Templates already granted keep working as RevenueCat entitlements. The callable is still deployed in CookPilot |
| Template purchases | RevenueCat entitlements `template_*` | RevenueCat remains purchase source; namespaced account may hold server reconciliation metadata | purchase hooks | RevenueCat Web Billing/webhooks | RevenueCat identity aliasing remains required |
| Cookbook purchase | Project unlock docs (the sole record; there is no account-wide `cookbook` entitlement to read) | namespaced `cookbookUnlocks` | `useCookbookPurchase` | RevenueCat webhook only — clients cannot write | Local marker carries access on the buying device until the webhook lands |
| RevenueCat identity | `recipeprinter:customer-id:v1` and known-customer marker | Unchanged | purchase module | purchase module/SDK | Anonymous RevenueCat customer is aliased on login |
| Saved projects | `products/recipePrinter/users/{uid}/printProjects/{id}` | Unchanged | account library/print loader | autosave transaction | Done. Legacy `users/{uid}/printProjects` was empty on 2026-10-10; fallback reads and rules match removed |
| Cookbook unlocks | `products/recipePrinter/users/{uid}/cookbookUnlocks/{id}` and local unlock keys | Unchanged | cookbook gate | RevenueCat webhook (admin SDK); client writes denied by rules | Done. Legacy `users/{uid}/cookbookUnlocks` was empty on 2026-10-10; fallback reads and rules match removed |
| Shared cards | `products/recipePrinter/sharedRecipeCards/{slug}` | Unchanged | public REST | Nobody: creating a link is gone | Done. The five legacy-only links in top-level `sharedRecipeCards` were deleted 2026-10-10 (a missing link now redirects home); fallback read and rules match removed |
| Feedback | `products/recipePrinter/feedback/{id}` | Unchanged | administrators only | feedback form | Done. `feedback-printer` no longer exists (verified 2026-10-10) |
| User photos | `recipeprinter/photos/{uid}/**` | `recipeprinter/photos/users/{uid}/**` | printed project URLs | authenticated browser | New writes only; retained public URLs remain valid |
| Anonymous photos | `recipeprinter/photos/anon/**` | `recipeprinter/photos/anonymous/{anonymousOwnerId}/**`, then copied to user prefix on adoption | local project URLs | anonymous browser | Local manifest, deterministic client copy, verify before any cleanup |
| Failed import captures | `debug/failed-imports/**` | `recipeprinter/debug/failed-imports/**` | administrators via bucket tooling | best-effort browser capture | New writes only; rows deleted by hand (no TTL), image bytes deliberately unswept -- see docs/failed-import-retention.md |
| Anonymous recipes/projects | session/local storage only; no anonymous Firestore project path found | authenticated project document after sign-in | queue/project hooks | browser | Preserve local source until copied assets and saved project verify |

## Local persistence involved in purchase or recovery

- `recipeprinter:customer-id:v1` and the known-customer marker: RevenueCat identity.
- `recipeprinter:unprotected-purchase:v1`: purchase-protection prompt.
- `recipeprinter:cookbook-unlocks:v1`: local project unlock cache.
- `recipeprinter:cookbook-unlock-pending:v1`: reconciliation marker.
- `recipeprinter:cookbook-legacy-claim:v1`: one-time legacy cookbook bridge.
- `recipeprinter:queue:v1`, `recipeprinter:project-meta:v1`, and print settings:
  anonymous working draft.
- `recipeprinter:anonymous-owner:v1` and `recipeprinter:anonymous-adoption:v1`:
  minimal asset/project adoption identity and recovery manifest.

## External release blockers

1. ~~Add the namespaced matches to the actual shared rules source.~~ **Done
   2026-09-04** -- there is no separate source; this repo is it. Both rulesets
   are deployed and verified live. What this blocker should have said is
   "remember to deploy after editing," which is now the header above.
2. ~~Update `claimRecipePrinterFreeTemplate` to merge Recipe Printer claim fields
   into the namespaced account document.~~ No longer needed by RecipePrinter: the
   member free-template perk was retired 2026-09-20.
3. Confirm RevenueCat webhook destinations and reconcile all existing template
   and cookbook customers; no webhook implementation exists in this repo.
4. ~~Backfill projects, unlocks, shared cards, and feedback before removing
   compatibility reads.~~ **Done 2026-10-10** -- nothing needed copying.
   `npm run audit:legacy` (read-only) found the three legacy locations empty
   and `feedback-printer` gone, so the compatibility reads and the legacy rules
   matches were removed. The rules change only takes effect once deployed (see
   the command above). Still open: profile fields on `users/{uid}`, which that
   audit does not count. CookPilot's `functions-pdf/src/storageSweeps.ts` still
   reads the top-level `sharedRecipeCards`, which no longer exists; it must
   read the namespaced collection or share-link photos are unprotected.
5. Failed-import capture image bytes grow without bound: `debugInbox` rows are
   reviewed and deleted by hand (and must NOT be given a TTL -- the rows still
   present are the unreviewed ones), but deleting a row leaves its photographs
   in Storage forever. Knowingly deferred 2026-09-11; the app now writes fewer
   of them. See docs/failed-import-retention.md for the options and the two
   traps in applying a lifecycle rule to a shared bucket.
