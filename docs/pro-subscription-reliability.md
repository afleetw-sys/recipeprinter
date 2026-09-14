# RecipePrinter Pro membership reliability (RevenueCat + Firestore mirror)

> ## Status (2026-09-13): hardened, not yet deployed
> The client-side fallback, the CookPilot webhook fixes below, and the new
> tests are written and passing (`npx vitest run` in this repo, `npm test` in
> CookPilot's `functions/`). **The CookPilot webhook change has not been
> deployed** — it touches the shared `cookpilot-bbecb` production backend and
> needs an explicit go-ahead and deploy step, same as every other change to
> that repo (see `docs/cookbook-unlock-webhook.md`'s deploy notes for the
> pattern: `firebase deploy --only functions:recipePrinterRevenueCatWebhook -P recipeapp`).
> `firestore.rules` in this repo already denies client writes to the new
> field this adds (`recipePrinterRevenueCatFetchedAtMs`) — that part ships
> with a normal push to Vercel, no separate deploy needed.

## What this closes

An audit of the existing RevenueCat integration (client SDK, the CookPilot
webhook, Firestore storage, and every purchase/restore/sign-in/out path)
found the architecture was already fundamentally sound, with two gaps that
mattered and a few smaller ones:

1. **The durable server-side mirror already existed and was already correctly
   written and rules-protected — nothing read it.** `loadRecipePrinterUserProfile`
   computed a Pro status from `recipePrinterEntitlements.pro` in Firestore, and
   its own doc comment said to prefer it over the live SDK — but every actual
   gate on `/print` used the live RevenueCat SDK exclusively. If RevenueCat was
   briefly unreachable, a paying Pro user's `customerInfo` was `null`, which
   every entitlement check reads identically to "never bought anything."
2. **The webhook swallowed a RevenueCat REST failure and still returned 200,**
   so a transient outage during webhook delivery silently and durably stranded
   the mirror at its old value — RevenueCat's retry only fires on a non-2xx.
3. No sandbox/production isolation in the webhook (a sandbox test event could
   mirror into the same fields a production event would).
4. `AccountMenu`'s Pro section had the same "collapse a fetch failure into
   Free plan" bug, independently.
5. Test coverage was strong for pure entitlement math and essentially absent
   for anything stateful (the webhook's HTTP-level behavior, identity
   switching, purchase hooks).

Nothing here is a new membership system. RevenueCat's live subscriber state
and the Firestore mirror the webhook already wrote were both correct; this
work wires the mirror in as a bounded fallback and fixes the two real
correctness bugs above.

## 1. Source of truth

**RevenueCat's live subscriber state**, read through
`@revenuecat/purchases-js`, whenever it's reachable. A live answer — active
*or* inactive — always wins over anything cached or mirrored. This hasn't
changed.

**The Firestore entitlement mirror** (`recipePrinterEntitlements` on
`users/{uid}` and `products/recipePrinter/users/{uid}`, written by CookPilot's
`recipePrinterRevenueCatWebhook` on every RevenueCat event) is the *bounded
fallback* used only when the live check itself fails. It is not a second
opinion consulted and compared — it's what gets read instead, and only then.

## 2. What's persisted

Per mirrored entitlement (the four legacy one-time templates, plus `pro`),
CookPilot's webhook writes:

```
recipePrinterEntitlements.<id> = {
  active: boolean,
  expiresAt: Timestamp | null,
  productIdentifier: string | null,
  willRenew: boolean | null,   // derived from RevenueCat's subscription record
}
recipePrinterRevenueCatSyncedAt: serverTimestamp()       // when this was last verified
recipePrinterRevenueCatFetchedAtMs: number               // when the underlying REST fetch was issued
```

This is deliberately more than a boolean: `expiresAt`/`productIdentifier`/
`willRenew` are what let the client answer "why does this person have access
right now, and until when" rather than just "yes/no" — including, in fallback
mode, distinguishing a renewing subscription from one that's canceled but
still active through its paid period (`components/AccountMenu.tsx`'s "Active
through {date}" copy works identically whether it's reading live or fallback
data). `recipePrinterRevenueCatSyncedAt` is the real "last verified against
RevenueCat at ___" fact — not approximated — that both the account menu and
any future diagnostics should point to. `recipePrinterRevenueCatFetchedAtMs`
exists purely to guard against a concurrency regression (see §5) and is never
read by the client.

Both fields are denylisted from client writes in `firestore.rules`
(`serverOwnedSharedUserFields`) on the legacy doc, and structurally excluded
by the namespaced doc's allowlist — a client cannot self-grant Pro by writing
this field directly (see `rules-tests/recipePrinter.rules.test.ts`).

**A missing/invalid expiration is never read as lifetime for a subscription.**
The four legacy templates are genuinely non-expiring one-time purchases, so a
`null` expiration there legitimately means "active forever." A subscription
(`pro` today) always carries a real `expires_date` from RevenueCat — if it
were ever mirrored with none, that's an anomaly, not a lifetime grant, and
both the webhook (`resolveRecipePrinterEntitlements`) and the client's own
independent copy of this rule (`synthesizeCustomerInfoFromMirror` in
`lib/proAccessFallback.ts`) treat it as inactive. Defense in depth: even if
one side were ever wrong, the other still refuses to grant Pro forever on a
missing date.

## 3. Fallback behavior

`lib/proAccessFallback.ts`'s `resolveEffectiveCustomerInfo` decides, on every
render, which `CustomerInfo`-shaped value every entitlement predicate in
`lib/recipePrinterPurchases.ts` actually gets fed:

- **Live check succeeded** (even showing nothing): use it. A confirmed "no
  entitlement" from RevenueCat always beats a possibly-stale mirror — the
  fallback path is never consulted here at all.
- **Live check failed** (network/RevenueCat unreachable) **and** the mirror
  shows something currently active (recomputed against the real clock at read
  time, not trusted from whenever it was last synced): fall back to a
  synthesized `CustomerInfo` built from the mirror. Every existing predicate
  (`hasProEntitlement`, `hasTemplateOrProEntitlement`, `canUseCardSize`,
  `hasMultiRecipeEntitlement`, `proSubscriptionDetails`) runs unchanged
  against this — there is exactly one set of "what does this customer own"
  functions, fed either a live or a fallback answer.
- **Live check failed and the mirror doesn't cover it** (expired, inactive, or
  there's no mirror at all — e.g. a signed-out browser, which has no
  server-side record to fall back to): fail locked, same as today.

This is what makes "an already-verified paying user shouldn't randomly lose
access during a brief outage" and "a fallback must not become a permanent
insecure source of truth" both true with one rule: the fallback's own
`isActive` check is re-derived against the current clock on every use, so the
moment real time passes the subscription's actual recorded expiration, the
fallback stops granting access on its own — no separate staleness timer
needed, and no dependency on some later webhook event ever arriving to flip
a flag.

`app/print/page.tsx` and `components/AccountMenu.tsx` both compute this once
and pass the result everywhere a raw `customerInfo` used to go. Neither place
invented its own fallback logic.

## 4. How stale state gets corrected

- **The live SDK check runs on every load and every identity change** —
  there's no caching layer in `@revenuecat/purchases-js` itself, so as soon as
  RevenueCat is reachable again, the next check simply supersedes the
  fallback. Nothing has to notice recovery explicitly.
- **The webhook re-verifies against RevenueCat's REST API on every event**
  (renewal, cancellation, billing issue, plan change, anything) rather than
  applying the event's own payload as a delta — so it's idempotent by
  construction: a duplicate or retried delivery just re-confirms the same
  truth, and there's no drift to accumulate.
- **A concurrency guard stops a stale re-fetch from regressing a fresher
  write.** Two webhook deliveries for the same uid can be in flight together
  (a fresh event and a delayed retry of an older one); each independently
  fetches "what's true now" and writes it, with no inherent ordering between
  them. `writeRecipePrinterEntitlements` now does this inside a Firestore
  transaction that compares the incoming fetch's own timestamp
  (`recipePrinterRevenueCatFetchedAtMs`) against whatever's already stored and
  skips the write if a fresher fetch already landed — "last write wins" now
  means "freshest fetch wins," not "whichever request happened to be slower."
- **A canceled subscription still reads as active through its paid period,**
  in both live and fallback modes, because both only ever check `expiresAtMs`
  against the current time — `willRenew` affects display copy, never the
  active/inactive decision.

## 5. What happens if RevenueCat or the webhook temporarily fails

- **Client-side, mid-session:** the fallback above takes over immediately for
  a signed-in user with a valid mirror. Print, theme, and card-size gates all
  keep working correctly through the outage; `AccountMenu` shows "Showing
  your last verified plan" instead of silently reading as Free.
- **Webhook-side:** `syncRecipePrinterEntitlementsFromRevenueCat` returning
  `null` (its REST fetch failed) now makes the webhook handler respond with a
  `5xx` instead of `200` — RevenueCat's own retry mechanism will redeliver the
  event later. Because the sync path is idempotent by construction, replaying
  it is always safe; nothing about "retry this" can corrupt state the way it
  might for a delta-application design.
- **A signed-out browser, or one that's never synced a mirror, has no
  fallback to fall back to** — this is unchanged and matches the existing
  anonymous-purchase model: nothing durable exists server-side for a purchase
  that's never been tied to an account.
- **Sandbox events cannot reach production Firestore fields.** The webhook
  reads the event's `environment` field (already present in every RevenueCat
  webhook payload, previously uncaptured for this path) and skips both the
  cookbook grant and the entitlement mirror sync for a `SANDBOX` event unless
  `RECIPEPRINTER_ACCEPT_SANDBOX_EVENTS` is explicitly set to `"true"` — the
  one escape hatch for manually verifying a sandbox purchase end-to-end
  against this shared project.

## 6. What tests protect this now

**CookPilot** (`functions/src/__tests__/recipePrinterRevenueCat.test.ts`):
auth rejection (401, now logged), a malformed payload (`{}`), a sandbox event
skipped by default and processed when explicitly accepted, a production event
mirroring to both documents, a `BILLING_ISSUE` event going through the same
generic path, duplicate delivery converging on identical state, a REST
failure returning a retryable `5xx` with no write, a retry succeeding once
RevenueCat is reachable again, a stale re-fetch failing to regress a fresher
mirror that already landed (the concurrency guard), and the missing-expiration
distinction (a subscription with no `expires_date` mirrors inactive; a legacy
template with the same shape still mirrors as lifetime-active).

**RecipePrinter**:
- `lib/proAccessFallback.test.ts` — every branch of `resolveEffectiveCustomerInfo`
  and `synthesizeCustomerInfoFromMirror`: live success (even empty) always
  wins, a live failure with a valid mirror falls back correctly, a live
  failure with an expired mirror fails locked, a live failure with no mirror
  fails locked, `willRenew` round-tripping so "canceled but active" reads
  correctly in fallback mode, and the missing-expiration rule holding on the
  client side independently of the server.
- `lib/recipePrinterPurchases.test.ts`'s `computeProLocks` suite — new
  monthly, new annual, renewal, cancel-but-active, expiration, restoring on a
  "new device" (a fresh `CustomerInfo` for the same account produces
  identical locks), a legacy theme owner without Pro, a cookbook owner
  without Pro, a legacy-theme-plus-Pro combination, and a fallback-synthesized
  `CustomerInfo` unlocking identically to a live one showing the same
  entitlement — plus the pre-existing 24-test "access model" suite, untouched.
- `lib/purchaseAccess.test.ts` — `revenueCatIdentityTransition`'s sign-out/
  sign-in (same account reuses identity), a different user signing into the
  same browser (switches identity outright, never aliasing one account's
  entitlements onto another), and guest-purchase aliasing; plus `purchaseGate`
  driven end-to-end by `resolveEffectiveCustomerInfo` for the outage-with-valid-mirror,
  outage-with-expired-mirror, and outage-with-no-mirror cases.
- `rules-tests/recipePrinter.rules.test.ts` — a signed-in user still cannot
  write `recipePrinterEntitlements`, `recipePrinterRevenueCatSyncedAt`, or the
  new `recipePrinterRevenueCatFetchedAtMs` to self-grant or backdate a Pro
  entitlement. (Not run in this environment — no JDK for the Firestore
  emulator; verify with `npm run test:rules` where one's available.)

## Known limits (unchanged, inherent, not introduced here)

Pro gating for print/export remains UI-enforced, not cryptographically
server-verified — the same structural limitation the cookbook unlock has
(`docs/cookbook-unlock-webhook.md`'s "known residual"), since card printing is
client-side `window.print()` with no server render step. This work makes the
*signal* more resilient (harder to accidentally lose or fake through an
outage) — it does not add server-side enforcement of the printed output,
which was never in scope here.
