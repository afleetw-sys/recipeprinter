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
| CookPilot membership | `users/{uid}.plusExpiresAt` | Unchanged | free-template eligibility | CookPilot backend | Read alongside namespaced Recipe Printer account |
| Recipe Printer profile | Recipe Printer fields on `users/{uid}` | `products/recipePrinter/users/{uid}` | print-page account gates | `claimRecipePrinterFreeTemplate`, administrators | Namespace-first plus legacy merge until backend/backfill completes |
| Admin role | `users/{uid}.recipePrinterAdmin` | namespaced user document | shared-card administration | server/admin only | Backfill; clients cannot write |
| Free template claim | `recipePrinterFreeTemplateGranted*` on `users/{uid}` plus RevenueCat grant | namespaced user document plus RevenueCat entitlement | claim UI and RevenueCat customer info | `claimRecipePrinterFreeTemplate` callable | Reconcile both stores; do not infer from a single field |
| Template purchases | RevenueCat entitlements `template_*` | RevenueCat remains purchase source; namespaced account may hold server reconciliation metadata | purchase hooks | RevenueCat Web Billing/webhooks | RevenueCat identity aliasing remains required |
| Cookbook purchase | RevenueCat `cookbook` entitlement, local pending markers, project unlock docs | RevenueCat plus namespaced `cookbookUnlocks` | `useCookbookPurchase` | RevenueCat and authenticated client reconciliation | Inventory confirms unlock docs are not the sole purchase source |
| RevenueCat identity | `recipeprinter:customer-id:v1` and known-customer marker | Unchanged | purchase module | purchase module/SDK | Anonymous RevenueCat customer is aliased on login |
| Saved projects | `users/{uid}/printProjects/{id}` | `products/recipePrinter/users/{uid}/printProjects/{id}` | account library/print loader | autosave transaction | Namespace-first plus legacy fallback; new writes namespace-only |
| Cookbook unlocks | `users/{uid}/cookbookUnlocks/{id}` and local unlock keys | namespaced user subcollection | cookbook gate | authenticated reconciliation | Namespace-first plus legacy fallback |
| Shared cards | `sharedRecipeCards/{slug}` | `products/recipePrinter/sharedRecipeCards/{slug}` | public REST and client counter | Recipe Printer admin | Namespace-first public read plus legacy fallback |
| Feedback | `feedback-printer/{id}` | `products/recipePrinter/feedback/{id}` | administrators only | feedback form | New writes only; backfill for administrative continuity; no client fallback |
| User photos | `recipeprinter/photos/{uid}/**` | `recipeprinter/photos/users/{uid}/**` | printed project URLs | authenticated browser | New writes only; retained public URLs remain valid |
| Anonymous photos | `recipeprinter/photos/anon/**` | `recipeprinter/photos/anonymous/{anonymousOwnerId}/**`, then copied to user prefix on adoption | local project URLs | anonymous browser | Local manifest, deterministic client copy, verify before any cleanup |
| Failed import captures | `debug/failed-imports/**` | `recipeprinter/debug/failed-imports/**` | administrators via bucket tooling | best-effort browser capture | New writes only; historical objects remain until retention |
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
2. Update `claimRecipePrinterFreeTemplate` to merge Recipe Printer claim fields
   into the namespaced account document.
3. Confirm RevenueCat webhook destinations and reconcile all existing template
   and cookbook customers; no webhook implementation exists in this repo.
4. Backfill profile fields, projects, unlocks, shared cards, and feedback before
   removing compatibility reads.
