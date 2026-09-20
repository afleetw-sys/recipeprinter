# Server-authoritative cookbook unlocks (RevenueCat webhook)

> ## ✅ Status (confirmed 2026-09-13): shipped and live
> All five steps below are done: the cookbook is on for everyone (the
> `COOKBOOK_ENABLED` flag that used to gate it was always `true` and nothing read
> it, so it has been removed), the webhook is deployed
> (`recipePrinterRevenueCatWebhook`, CookPilot `functions/src/recipePrinterRevenueCat.ts`,
> last redeployed 2026-09-01) and confirmed configured in RevenueCat's
> dashboard — production and sandbox, all apps, all events, correct
> authorization header, deliveries showing as successful — and
> `firestore.rules` denies client writes on both the namespaced and legacy
> `cookbookUnlocks` paths. A prior note here (dated 2026-08-15, see below)
> said the dashboard webhook was missing; that was true at the time but is no
> longer the case. This section is kept as a historical record of exactly
> that failure mode — a webhook that returns 200 on every call regardless of
> whether it actually granted anything, so "delivery succeeded" in
> RevenueCat's UI is not proof the unlock doc was ever written — since it is
> the kind of gap that can silently reappear and is worth knowing how to spot
> again.
>
> A code review (2026-09-13) of `processCookbookEvent`/`grantCookbookUnlock`/
> `revokeCookbookUnlock`/`grantTransferredCookbookUnlocks` found no defect:
> the logic matches RevenueCat's documented webhook payload shape (`event`
> wrapper, `subscriber_attributes.<key>.value`, `product_id`/`entitlement_ids`
> for matching, `transferred_from` for TRANSFER events). That review is static
> analysis, not a live-data check — the one thing it cannot confirm is that a
> real purchase has actually produced a `source: "revenuecat"` unlock doc in
> Firestore. Run `scripts/cookbook-unlock-audit.mjs` (read-only, needs
> `GOOGLE_APPLICATION_CREDENTIALS` for a service account with Firestore read
> access) for that confirmation whenever it's convenient — it is cheap and
> safe to run at any time, not just once.

**Audit item #2 (P1 security).** Closes the free-unlock hole and adds
refund/chargeback revocation. The unlock doc becomes **server-written only**.

## The hole

Access is gated on the mere *existence* of
`products/recipePrinter/users/{uid}/cookbookUnlocks/{projectId}`
(`lib/cookbookUnlocks.ts` → `loadCookbookProjectUnlock`). Today the **client**
writes that doc and the rules only require ownership + key shape — no proof of
purchase — so any signed-in user can `setDoc` it (or set the
`recipeprinter:cookbook-unlocks:v1` localStorage key) and unlock the paid
cookbook for free. No webhook meant refunds never revoked.

## The design (as built)

The RevenueCat webhook already exists and is dashboard-configured
(`recipePrinterRevenueCatWebhook`, CookPilot `functions/src/recipePrinterRevenueCat.ts`,
authenticated by the existing `RECIPEPRINTER_REVENUECAT_WEBHOOK_AUTH` secret) —
it currently syncs template entitlements. It's been **extended in place** to
also own cookbook unlocks. **No new function, secret, or dashboard webhook.**

Because unlocks are per-project and one-time (non-renewing), the account-wide
`cookbook` entitlement can't say which projects were paid — only the per-purchase
**event** carries the project id, via the `cookbook_project_id` subscriber
attribute the client sets right before checkout (Step 0). So:

- **Grant** on `INITIAL_PURCHASE` / `NON_RENEWING_PURCHASE` for the `cookbook`
  product/entitlement → write the unlock doc for the resolved uid + that event's
  project id.
- **Record** every purchase in `products/recipePrinter/cookbookPurchases/{transactionId}`
  (`{projectId, appUserId, uid, environment, revoked}`) — powers precise refund
  targeting and deferred grants.
- **Revoke** on `CANCELLATION` / `REFUND` / `CHARGEBACK` / `EXPIRATION` → look up
  the purchase record by transaction id, delete that project's unlock doc.
- **Signed-out purchase** (anonymous app_user_id, no Firebase uid): recorded now,
  then granted on the `TRANSFER` event RevenueCat fires when the buyer signs in
  (matched by `appUserId`). `webhookSubjectIds` already filters anonymous ids.

## Code changes (done)

- **recipeprinter** `lib/recipePrinterPurchases.ts` — Step 0: sets the
  `cookbook_project_id` subscriber attribute before the cookbook purchase.
- **CookPilot** `functions/src/recipePrinterRevenueCat.ts` — grant/record/revoke/
  transfer helpers + `processCookbookEvent`, wired into the existing webhook
  handler (which no longer early-returns on an anonymous-only event, so
  signed-out purchases are recorded). Builds clean (`npm run build`).

**Status:** the `firestore.rules` lockdown (Step 4) and the client write-removal
(Step 5) are now **written and in the repo, awaiting Steps 2–3**. They must not
be *deployed* until the webhook is live and a sandbox purchase is verified — see
the warning at the top. Note a git push ships Step 5 (client code, via Vercel)
but NOT Step 4, which needs an explicit `firebase deploy --only firestore:rules`.

Two things changed versus this document's original plan:

- **`persistCookbookProjectUnlock` is kept, not gutted.** The plan said it should
  stop writing. It can't: `grantCookbookUnlock` (lib/duplicateProjects.ts, added
  after this doc) moves a purchase onto the copy that duplicate-cleanup keeps,
  and is built around the write being *refused* — a rejection means "could not
  move the purchase", so the copy holding it survives instead of being deleted.
  Making the function a silent no-op would have made it report success and
  **delete the copy that held the purchase**. It stays, and its refusal is now
  load-bearing.
- **A latent bug in that path is fixed here.** `persistCookbookProjectUnlock` set
  the local unlock marker *before* the Firestore write, so a refused write still
  left the device claiming an unlock the account doesn't have — harmless while
  clients could write, guaranteed on every attempt once the rules lock down. The
  marker now follows the write.

Also added: rules tests for these paths in `rules-tests/` (there were none for
the most security-critical rule in the file). They need Java for the Firestore
emulator — `npm run test:rules` — and have **not been run yet on this machine**,
which has no JDK.

---

## Deploy order (no window where purchasing breaks) — historical

Kept for the record and because it documents a real failure mode (see the
status note at the top). All steps below are done as of 2026-09-13.

The client keeps writing the unlock until the very end, so nothing breaks mid-rollout.

### Step 1 — ship the client attribute (recipeprinter → Vercel)

`lib/recipePrinterPurchases.ts` is already edited. Deploy via the normal push to
the Vercel-watched branch. Harmless until the webhook is live.

### Step 2 — deploy the webhook (CookPilot → cookpilot-bbecb)

```bash
cd ~/Desktop/CookPilot/functions && npm run build
# Deploy ONLY this function, to the RecipePrinter project (NOT the default
# pageturner-951b4). Confirm the target in the CLI prompt.
firebase deploy --only functions:recipePrinterRevenueCatWebhook -P recipeapp
```

> **Correction (2026-08-15).** This section used to say the webhook was already
> dashboard-configured and that no RevenueCat change was needed. **That was
> wrong.** RevenueCat's Integrations page lists no webhook at all, so the
> function has never been called — no `source: "revenuecat"` unlock has ever been
> written, `cookbookPurchases` was never created, and the function logs show no
> invocations.
>
> It went unnoticed because the webhook's *other* job (mirroring template
> entitlements into Firestore) is not on any critical path: template gating reads
> `customerInfo` from the RevenueCat SDK in the browser. So the webhook could be
> unwired forever with no visible symptom — until cookbook unlocks depended on it.
>
> **Follow-up (confirmed 2026-09-13).** The dashboard webhook has since been
> added — production and sandbox, all apps, all events, correct
> `Authorization` header — and RevenueCat shows deliveries succeeding. Steps
> 2b–5 below are complete; they're kept as the record of what "complete"
> required.

### Step 2b — wire the webhook up in RevenueCat (REQUIRED)

In the RevenueCat **project that issues `NEXT_PUBLIC_REVENUECAT_WEB_API_KEY`**
(webhooks are per-project — check this first, it is the easiest thing to get
wrong), add a webhook under Integrations:

- **URL:** `https://recipeprinterrevenuecatwebhook-gxip6bzrkq-uc.a.run.app`
- **Authorization header:** the exact value of the
  `RECIPEPRINTER_REVENUECAT_WEBHOOK_AUTH` secret. Read it with
  `npx firebase-tools functions:secrets:access RECIPEPRINTER_REVENUECAT_WEBHOOK_AUTH -P recipeapp`
  — the function compares it verbatim and returns 401 on a mismatch.
- **Events:** at minimum `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`,
  `CANCELLATION`, `REFUND`, `CHARGEBACK`, `EXPIRATION`, `TRANSFER` — the set
  `processCookbookEvent` handles. Sending everything is fine; the rest is ignored.

Use **Send test event** to confirm delivery and auth before spending anything.
Sandbox events are processed (the handler records `environment` but does not
filter on it).

### Step 3 — verify with a sandbox purchase (BEFORE locking rules)

Make a RevenueCat **sandbox** cookbook purchase while signed in, then check:

- `products/recipePrinter/users/{uid}/cookbookUnlocks/{projectId}` exists with
  `source: "revenuecat"`.
- `products/recipePrinter/cookbookPurchases/{transactionId}` recorded.
- (Optional) a sandbox refund deletes the unlock doc and sets `revoked: true`.

Only proceed once a purchase produces the server-written unlock.

### Step 4 — lock the rules (recipeprinter repo → cookpilot-bbecb)

Apply the diff below to **this repo's** `firestore.rules` (the authoritative
ruleset for `products/recipePrinter/*` — CookPilot's `firestore.rules` does not
contain these paths, so **do not deploy rules from the CookPilot repo** or you'll
clobber them). Deploy targeting cookpilot-bbecb.

```diff
// firestore.rules — namespaced (currently ~line 116)
   match /cookbookUnlocks/{unlockId} {
     allow read: if owns(uid);
-    allow create: if owns(uid)
-      && request.resource.data.projectId == unlockId
-      && request.resource.data.keys().hasOnly(["projectId", "unlockedAt"]);
-    allow update, delete: if false;
+    // Server-only (RevenueCat webhook via admin SDK, which bypasses rules).
+    // No client can grant itself the paid unlock.
+    allow write: if false;
   }
```

```diff
// firestore.rules — legacy (currently ~line 165; was even looser)
   match /users/{uid}/cookbookUnlocks/{projectId} {
     allow read: if owns(uid);
-    allow write: if owns(uid)
-      && request.resource.data.projectId == projectId;
+    allow write: if false;
   }
```

Existing unlock docs stay readable — current owners unaffected, no backfill.
**Verify after deploy:** a fresh purchase still unlocks (server-written) and
existing owners still read unlocked.

### Step 5 — remove the now-dead client writes (recipeprinter → Vercel)

Client writes are denied after Step 4 (they're already wrapped in try/catch, so
this degrades cleanly — but remove the dead code):

- `lib/cookbookUnlocks.ts`: `persistCookbookProjectUnlock` and
  `reconcileCookbookProjectUnlocks` stop `setDoc`-ing; keep
  `markCookbookProjectUnlockedLocal` (local UX) and the read paths.
- `lib/useCookbookPurchase.ts`: drop the `persistCookbookUnlockWithRetry` call —
  the webhook owns the write. Keep the local marker + `onUnlocked` flow.

---

## Known residual (inherent to client-side export)

Export/print is client-side `window.print()`, so a determined user can bypass
any gate locally regardless of rules — architectural, not introduced here. A
refund deletes the server doc and blocks re-entitlement, but a device still
holding the `recipeprinter:cookbook-unlocks:v1` local marker keeps local access
until it clears. To harden later, make `loadCookbookProjectUnlock` treat the
server as authoritative (re-check and clear the local marker when the server doc
is absent) instead of returning early on the local marker. Out of scope for
closing the free-unlock hole.
