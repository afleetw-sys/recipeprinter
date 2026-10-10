# Free import allowance: implementation plan (rev 4)

Status: **plan only. Nothing is built or deployed.** Audited 2026-10-09 against
`claude/cookbook-organize-search` and the CookPilot working tree at `/Users/ameliawinger/Desktop/CookPilot`.

**Rev 2 decisions (Amelia, 2026-10-09):**
- Key on `rpAnonId`, metered by a CookPilot callable. No PostHog ids, no Firebase Anonymous Auth.
- **Measure first, restrict no one.** Real usage decides between 5 and 10.
- Measure mode records **every** successful import, past any limit, with bounded documents.
- **Every free import awaits the server's reservation before a parser request starts.**
- Cookbooks stay unlimited, bought or not. *(Superseded by rev 4: unbought books have a free size.)* The cookbook-to-cards route is closed (section 6).
- A soft paywall is fine. No complicated security without a meaningful benefit.
- Signing in or out never resets an allowance, and unrelated accounts on one device are never
  combined.
- A focused unit-test suite for the metering logic is approved.

**Rev 3 decisions (Amelia, 2026-10-09):**
- RecipePrinter stays positioned as a **free recipe printer**. Every "free" keyword, title and
  heading stays.
- Core message: **"5 free recipe imports every 30 days. No account required."**
- Only claims that would become untrue get rewritten, and only those sentences.
- Allowance copy and UI go live **only with enforcement**, never during measurement (section 8).

**Rev 4 decisions (Amelia, 2026-10-09). These replace earlier cookbook and Pro wording:**
- **Sell by what you're making, never by imports.** Each price unlocks one thing, and the two never
  overlap or appear side by side (section 2A).
- **Recipe cards:** a free allowance of imports every 30 days. Pro removes it.
- **Cookbooks:** each book can be previewed free with up to a small number of recipes (downloading always costs $19.99). **Buying that book**
  removes the cap and unlocks export. Imports into a cookbook never use the card allowance.
- **Unbought cookbooks are no longer unlimited.** That reverses the rev 2 rule. Reasons:
  - unlimited parsing for books that may never be bought costs real money
  - a free user was seen harvesting recipes by screenshot (section 1.5)
- **Pro doesn't change cookbooks, and a cookbook purchase doesn't change recipe cards.**
- **The numbers:**
  - card allowance: leaning **10**, from the usage data in section 1.5
  - cookbook free size: **10** (D8). The point is to ask for payment at a reasonable time, so
    books that are never bought don't keep costing parses and storage.

Goal when we eventually enforce:
- **Free visitors:** N card imports in any rolling 30 days, and up to M recipes in each unbought
  cookbook.
- **Pro:** unlimited card imports.
- **A bought cookbook:** unlimited recipes in it.

---

## 0. Summary

1. **Subject:** `rpAnonId` (`anonymousOwnerId()`, [lib/anonymousOwner.ts](../lib/anonymousOwner.ts)). It's
   already attached to every CookPilot callable by `withAnonId` ([lib/parser.ts:72](../lib/parser.ts)),
   and already the per-visitor key for CookPilot's hourly limits. When signed in, the verified
   `auth.uid` is used alongside it, under the account rules in section 5.3.
2. **Meter:** one new App Check callable in CookPilot, `recipePrinterImportMeter`, with ops
   `reserve` and `settle`. It's not a parser, and no parser changes.
3. **Client:** one integration point, `runParse` ([lib/queue.ts:680](../lib/queue.ts)).
   1. reserve, **awaited**
   2. then parse
   3. then settle
4. **Measurement:**
   - Each subject document keeps a per-day count map: at most 31 keys, unbounded counts. This
     records every import past any limit.
   - It also keeps the newest 10 exact entries, which is enough to compute "would be blocked" at
     **both** 5 and 10 from the same data.
   - The server's 30-day count goes onto the PostHog `recipe_imported` event, so the distribution,
     returns and conversion are ordinary PostHog queries.
5. **Exemptions:**
   - **Cookbook mode never calls the meter.** The cookbook-to-cards switch was deleted on
     2026-09-18 (commit `0cae87c0`), and no other path moves recipes out of a book (section 6).
   - **Pro:** skipped client-side when known, and verified server-side from the webhook mirror
     when the client doesn't know yet.
6. **Control:** one config doc. `mode: "off" | "measure" | "enforce"`. This rollout only ever sets
   `off` or `measure`. Any meter error fails open.
7. **IP monitoring:** dropped on 2026-10-10 (section 7). No IP addresses are processed.
8. **Messaging (section 8):**
   - one quiet line in the shared import panel, which always shows how many imports are used
     toward the limit, signed in or out
   - the existing Pro dialog when the limit is reached
   - seven copy fixes (C1 to C7)
   - every "free" title and keyword kept
   - all of it ships in one go-live PR, gated by `IMPORT_ALLOWANCE_LIVE`, never during measurement
9. **Cookbooks (rev 4):**
   - an unbought book can hold up to M recipes as a free preview, counted as **recipes in the book**, checked in the
     browser, with no server work
   - **no new dialog:**
     - the existing `CookbookWelcomeDialog` states the rule up front
     - the rail counts toward M
     - at M, the rail's "Add recipes" becomes **"Buy & add recipes"** and goes straight to the
       existing cookbook checkout, the same pattern as "Buy & Print"
   - buying the book removes the cap
   - the card meter never sees cookbook imports

---

## 2A. The product model users see (rev 4)

| You're making… | Free | Pay to unlock |
|---|---|---|
| **Recipe cards and pages** | **N recipe imports every 30 days.** Edit, customize and reprint as much as you like. | **Pro, $4.99/month:** unlimited imports, every theme, 4×6 cards, printing several at once |
| **A cookbook** | **Preview it free with up to M recipes.** Downloading or printing it always takes the purchase. | **That cookbook, $19.99 once:** unlimited recipes in it, export, edits and re-exports forever |

The rules that keep it clear:
1. **A visitor only sees the rule for what they're doing.** The card import box shows the card
   allowance. The cookbook rail shows "8 of 10 recipes". Nobody is ever asked to choose between
   $4.99 and $19.99.
2. **Each limit opens only its own purchase, and no new dialogs are added:**
   - **card limit:** the existing `ProUpgradeDialog`
   - **cookbook cap:** "Buy & add recipes" goes straight to the existing cookbook checkout, the
     way "Buy & Print" already does. The explanation lives in the welcome dialog everyone sees
     when they start a book, and in the rail count.
3. **Imports into a cookbook never use the card allowance.** A book's free size is its own.
4. **Pro and cookbooks stay separate**, as the site already says (`lib/seoLandingPages.ts:2391`).
   Pro members keep 20% off their first cookbook.
5. **Always free:** editing, customizing, reprinting, and printing one recipe at a time.

**One sentence for the FAQ, `llms.txt` and pricing mentions:**

> "Yes, it's free. Import N recipes every 30 days and print them as often as you like, or
> preview a cookbook free with up to M recipes. Pay only for what you're making: Pro for unlimited
> recipe cards, or $19.99 to download a cookbook and keep adding to it."

**Why M counts recipes in the book, not recipes added:** "up to M recipes" then means exactly the
count people see in the rail, and deleting one frees a space. That clarity matters more than the
small loophole where someone deletes and re-imports to stay under M. CookPilot's hourly limits
(5 photos and 30 links an hour) already cap what that could cost. Every source counts, including
Paprika, CookPilot library, typed-in and shared recipes, because users count recipes, not import
methods.

---

## 1. Audit findings that shaped this revision

### 1.1 Import paths (unchanged from rev 1)

Every parser-backed import, from any surface (home, SEO capture, rail, dialog), goes through
`runParse`, via `addUrl` (845), `addImageFiles` (926), `addImages` (952) and `addText` (964).
Home and SEO pages only stash a payload, which `/print` replays
([app/print/page.tsx:3953](../app/print/page.tsx)). `paprika`, `cookpilot`, `shared` and `manual`
recipes never touch a parser.

### 1.2 Parser endpoints and how easy each one makes it to skip the meter

| Endpoint | Gate today | Usable without our page? | What a bypasser gets |
|---|---|---|---|
| **`/api/parse`** (Vercel) [route.ts:549](../app/api/parse/route.ts) | **None** except an in-memory IP limit (30 per 10 minutes per warm instance, `lib/server/rateLimit.ts`). No App Check, no auth, no origin check. | **Yes, with plain `curl`.** | Full parsed recipe JSON for any public URL, and the parse runs through CookPilot's paid scrape. It's the one genuinely open door. To use the result *in RecipePrinter* they'd still have to inject it into localStorage, or paste it back into a (metered) text import. |
| `parseRecipeFromURL`, `parseRecipeFromImages`, `parseSocialRecipe` (CookPilot callables) | `enforceAppCheck: true`, without replay protection. Per-uid or per-`rpAnonId` hourly limits. A missing `rpAnonId` falls into the shared public bucket. | Only with an App Check token, which needs a real browser on our domain. A token copied from devtools works for its lifetime (about 1 hour). | The same JSON. A developer-level effort. |
| `recipePrinterParseRecipeFromURL`, `recipePrinterParseSuppliedHTML` (CookPilot HTTP) | Shared secret `RECIPEPRINTER_PARSER_SECRET`, server to server | No | Nothing |
| `callOpenAI` | App Check plus a required Firebase user (CookPilot app) | No | Not relevant |
| `getImageImportQuota` | App Check, read-only | Not relevant | Nothing |

**The meter itself, once enforcing,** is skippable by a developer in four ways:
- **blocking its request:** the client fails open, which is the reason for rule E1 below
- **editing the queue in localStorage**
- **faking cookbook mode** in devtools
- **using a fresh `rpAnonId`:** a private window, which is the trivial one

**Conclusion.** For an ordinary cook, every route costs more effort than a private window, so the
soft paywall holds as well as any anonymous paywall can. The only bypass that needs no browser is
`curl` against `/api/parse`. It matters for cost more than for the paywall, and it exists today
whether or not we build a meter.

What I recommend, in proportion:
- **Now, nearly free:** measure whether anyone uses `/api/parse` outside the app. The client sends
  the import id in an `x-rp-import-id` header. The route forwards it in the body it already posts
  to CookPilot. CookPilot's existing handler logs one structured line, `hasImportId`, which Cloud
  Logging keeps for 30 days and which a free logs-based metric can count. Calls without an id are
  either outside the app or a pre-meter cached bundle.
- **Only if that number is meaningful:** have the meter return a short-lived HMAC ticket, and have
  `/api/parse` require it. A missing ticket would send the client to the App-Check-gated callable
  instead, so a real cook is never stuck. That's about 30 lines in each repo, with no new service.
  Not worth building before the data says so.
- **E1, at enforce time only:** fail open on a meter error **unless** this browser's last server
  answer said the limit was reached. That makes "block the meter request" useless to someone who
  is already at the limit, without ever blocking anyone because of our own outage.
- **Not recommended:** App Check verification in Next.js, fingerprinting, CAPTCHAs, replay
  protection. Each costs more than it protects for a soft gate.

### 1.3 Cookbooks: the cookbook-to-cards route no longer exists

- **The switch is gone.** The in-workspace Cards/Cookbook switch, `exitCookbook` and the welcome
  dialog's "Back to recipe cards" were all **deleted on 2026-09-18 in `0cae87c0`**. The doc comment
  on `PrintConfigPanel` that still describes "Leaves the book and prints the same recipes as
  cards" is stale; the prop is gone.
- **Becoming a cookbook is now one-way:** `scaffoldCookbook` ([app/print/page.tsx:1499](../app/print/page.tsx)).
  `restoreCookbook` only goes *into* a book.
- **"New project" and "New cookbook" can't carry recipes across.** Both file and release the
  working project, then empty the queue (`components/PrinterWorkspace.tsx:194`,
  `app/projects/page.tsx:151`).
- **There's no "add from another project" source.** The Apps tab offers CookPilot and Paprika
  only.
- **An unbought book can't be exported or printed.** Print reads "Buy & Print" (`cookbookLocked`
  gates both) and `/api/cookbook-pdf` checks the unlock on the server. A browser Cmd+P prints with
  the diagonal "PREVIEW" watermark (`.rp-print-locked`, `app/print/print.css:9408`). That's the
  same treatment every Pro-locked card print already gets.
- **Saved projects from before 2026-09-18** that were left in card view with a stashed book import
  in card mode, so they're metered like any card project.

So recipes imported into a cookbook stay in that cookbook, and the only way out of an unbought
book is to buy it. Rev 4 adds the free size (section 3.2) for cost reasons and because of the
screenshot user (section 1.5), not because of a cards route. The plan adds one guard: a comment on `scaffoldCookbook` and on `startNewProject` saying
that any future path moving recipes from a book into card mode must charge them as imports.

### 1.4 How the hourly photo quotas apply to cookbooks

CookPilot enforces photo imports **per caller, regardless of project, mode or cookbook purchase**:

| Caller | Limit | Source |
|---|---|---|
| signed out (`rpAnonId`) | 5 an hour | `recipePrinterAnonLimit("image")` |
| signed-in free | 5 an hour | `parseRecipeFromImages.ts`, Pro check |
| signed-in Pro | 30 an hour | `hasActiveRecipePrinterPro` |
| bought cookbook | **no change**: 5 an hour unless also Pro | CookPilot never reads `cookbookUnlocks` |

Links and text keep their own hourly limits: 30 an hour per visitor on the callables, and the
`/api/parse` IP limit.

So even in a bought book, imports are **unlimited in count but paced in time** for photos, and
the free size in rev 4 doesn't change that. Two consequences for when we enforce:

- Cookbook copy says a bought book holds "**as many recipes as you like**", never "unlimited
  imports", which would be untrue for photos.
- Today the photo-limit message offers Pro even inside a cookbook
  ([app/print/page.tsx:6220](../app/print/page.tsx)). That's existing behaviour, and fine. Whether a
  bought cookbook should raise the photo limit is decision **D3**. It would need CookPilot to read
  that book's unlock, so I'd leave it until someone hits it.

### 1.5 Usage data from PostHog (queried 2026-10-09)

Method:
- HogQL against `recipe_imported`, counted by `person_id`, for link, photo and text sources only
- `?internal` sessions excluded. Only 3 events carried the tag, so this removed almost nothing.
- **Excluded by hand:** 5 internal or family person ids, plus 1 Firebase account id, matched to
  its person through `person_distinct_ids`. The ids are kept with the saved queries in PostHog,
  not in this repo. One excluded person alone accounted for about 175 imports.

**Last 90 days, before exclusions:**
- 249 importers, 1,066 imports
- 150 people (60%) imported exactly one
- 99 people (40%) imported two or more, and did 86% of all imports

**Last 30 days, after exclusions:**

| | Limit of 5 | Limit of 10 |
|---|---|---|
| People over it | 24 of 176 (14%) | 13 of 176 (7%) |
| Imports it would block | 273 of 609 (45%) | 179 of 609 (29%) |

**Who the 24 people over 5 are** (purchases and cookbook events over 90 days):

| | Over 10 (13) | 6 to 10 (11) | Total |
|---|---|---|---|
| Bought Pro (exempt) | 2 | 0 | 2 |
| Some cookbook activity | 3 | 1 | 4 |
| **Free, no cookbook, never bought** | **8** | **10** | **18** |

**Free users a card limit would actually reach:**

| | Limit of 5 | Limit of 10 |
|---|---|---|
| People | 18 (10% of importers) | 8 (5%) |
| Imports blocked | ~126 (21%) | ~58 (10%) |

What it tells us:
- **Most visitors import one recipe.** 86% stay at 5 or under in a month.
- **The heaviest users mostly pay or build books already,** with no limit pushing them. Of the top
  7, two bought Pro and three show cookbook activity.
- **Choosing 5 or 10 is really a choice about 10 moderate free users** (6 to 10 imports a month).
- **Leaning 10 for cards:**
  - it fits the free positioning
  - it still reaches the 8 heavy free users, where conversion upside is
  - loosening a limit later is a gift, while tightening one is a take-away
- **One heavy free user takes screenshots of recipes instead of printing.** Screenshot-style users
  inflate the "might convert" count, and they are why unbought cookbooks can't stay unlimited
  (rev 4).

Caveats:
- one month, 176 people
- `cookbook_activity` is only a proxy for cookbook use
- a Pro subscription older than 90 days shows as `pro_bought = 0`
- each recipe from a roundup link currently counts as a separate import
- **step A and measure mode fix all four**

---

## 2. Architecture

```
runParse(id, method, input)
  ├─ exempt? cookbookMode | scaffold override | client-known Pro ──▶ parse as today (no meter)
  ├─ await meter.reserve({importId: id, method, dedupeKey})        ◀── ALWAYS before the parser
  │      timeout 5 s / error ─▶ fail open, record import_meter_unavailable, continue
  │      measure: always allowed; returns used30d, wouldBlockAt5/10
  ├─ parse (unchanged)
  └─ meter.settle({importId, outcome})   (fire-and-forget, keepalive)
```

- The reservation is awaited in every case, as you asked. In measure mode that adds one round trip
  to every free import and restricts nobody: roughly 100 to 300 ms warm, 1 to 3 s on a cold start.
  `meterMs` on the import events records it.
- If p95 latency is bad, `minInstances: 1` on the meter function (roughly $5 to $10 a month)
  removes cold starts. Decide from the data (**D4**).
- Settle doesn't block the cook. A lost settle leaves a pending entry that expires after 5 minutes.
  Measurement then misses that one import, which is visible as `import_meter_unavailable{op:"settle"}`.

---

## 3. What counts

### 3.1 Toward the card allowance (server meter)

**Counted:** one import action (one link, one photo batch, one pasted text), of method `url`,
`image` or `text`, from any surface, that leaves at least one recipe `ready`, in a project that
isn't in cookbook mode, for a visitor who isn't Pro.
- a roundup counts once
- a network retry counts once (idempotent per import id)

**Not counted:**
- failures of any kind, interruptions, timeouts
- a link or text already counted in the last 30 days (dedupe key)
- edits, reprints, reopening a project
- `manual`, `shared`, `paprika`, `cookpilot` (D1, recommended unmetered)
- cookbook mode, which has its own rule (3.2)
- Pro

### 3.2 Toward a cookbook's free size (rev 4, browser only)

**Counted:** recipes in the book, from any source.
- An **unbought** book (`cookbookLocked`) holds up to M recipes.
- Starting another add when the book already holds M takes the cook to checkout instead.
- **Edge cases:**
  - an import already running when the book reaches M still lands
  - a roundup or multi-recipe photo that would push past M keeps only what fits, the same
    trimming `singleRecipeOnly` does for free card mode, and the rail says so
  - a book that already holds more than M (an old book, or one made from a large card project)
    keeps every recipe; only adding more is gated
- **No cap:** bought books (`isCookbookProjectUnlocked`).

Pro doesn't lift it. Pro members get 20% off the book instead.

---

## 4. Measurement design

### 4.1 Fields

On every free import:
- **`recipe_import_started`** is unchanged. It fires when the import begins, before the
  reservation, so it keeps counting every import a cook started (Amelia, 2026-10-09).
- **`recipe_imported`** gets:
  - `meterMs`
  - `importId`
  - `extra` (bloomed roundup recipes)
  - `cookbook`
  - `meter_used_30d`: the server's counted imports in the previous 30 days, **before** this one,
    unbounded
  - `meter_would_block_5`, `meter_would_block_10`
- **`recipe_import_failed`** gets `meterMs`.
- **`import_meter_unavailable`**: `{ op, reason: "timeout" | "error" }`
- **`meter_subject_kind`** on `recipe_imported`: `browser` or `account` (an event property, not a
  super property)

Cookbook and Pro imports still fire `recipe_imported` (`cookbook: true`, or no meter fields), so
PostHog sees **all** usage. The server sees free card-mode usage, which is the population the limit
would affect.

### 4.2 The questions, and how each is answered

| Question | Query (PostHog, by **person**) |
|---|---|
| Successful imports per visitor | distribution of `max(meter_used_30d) + 1` per person over the window, or a count of non-extra `recipe_imported` per person over 30 days |
| Percentage exceeding 5 or 10 within 30 days | persons with any `meter_would_block_5` (or `_10`) = true |
| How many of those return | of those persons, the percentage with a `$pageview` on a later day, and how many later days |
| Do frequent importers convert | of those persons, the percentage with `purchase_completed` (`pro` / `cookbook`) within 30 days, against the same figure for persons under the line |
| Import-limit impressions, upgrade clicks, purchases, abandonment | needs enforcement. In measure mode, the "would block" counts are the projected impressions. The funnel events (`paywall_viewed{trigger:"import_limit"}`, `pro_continue_clicked`, `purchase_*`, `pro_decline_answered`) already exist and get used when we enforce. |

- **Cross-check:** an optional read-only CookPilot script reads every meter document (about one
  read per active visitor, pennies) and prints the server-side histogram. It catches undercounting
  in PostHog from ad blockers or `?optout`.
- **Choosing between 5 and 10:**
  - Measure mode gives the **cost** side exactly for both, from the same data: how many visitors
    and imports each would block.
  - The **benefit** side, conversion caused by a paywall, can only be seen by enforcing. With a
    small number of visitors over the line, a randomized split won't reach significance. So the
    honest method is to pick from the distribution and conversion correlation, enforce, and compare
    month against month.
  - If at least about 200 visitors a month cross 5, the server-side 50/50 bucket from rev 1 is
    ready to switch on instead.

---

## 5. Firestore model and API

All of this is in CookPilot's Firestore and admin-only (default deny, no client rules).

### 5.1 `recipePrinterImportMeter/{subject}`: bounded

`subject` is `b_{base64url(sha256(rpAnonId))[0..22]}` for a browser, or `u_{uid}` for an account.

```ts
{
  entries: Array<{              // exact log, BOUNDED: pending (≤10) + newest 10 counted in window
    id: string;                 // import id
    at: Timestamp;              // function clock, never the client's
    s: "p" | "c";               // pending | counted
    m: "url" | "image" | "text";
    k?: string;                 // dedupe key: 16 chars of sha256(rpAnonId + "\n" + canonical URL / normalized text),
                                // salted per browser so the server can't dictionary-match it to a recipe page
                                // (we store only a hash of rpAnonId, never the raw id)
    o?: string;                 // browser docs: uid signed in at reserve time, absent if signed out
    prev?: string;              // browser docs, signed-out entries: lastUid at the time (section 5.3)
    claimedBy?: string;         // browser docs: account this signed-out entry was attributed to
  }>;
  days: Record<string, number>; // "2026-10-09" → counted imports that UTC day. ≤31 keys, UNBOUNDED counts
  total: number;                // lifetime counted imports (measurement only)
  lastUid?: string;             // browser docs: last account that reserved here
  firstSeenAt: Timestamp;
  net?: string;                 // keyed hash of the latest network (section 7)
  expiresAt: Timestamp;         // TTL: newest activity + 31 days
}
```

- **Every success is recorded** in `days` and `total`, at any count.
- **`used30d`** is the sum of `days` over the last 30 UTC days. That's day-granular, which is fine
  for measurement.
- **Exact rolling decisions** use `entries`. Keeping the newest 10 counted is provably enough for
  any limit up to 10: the Lth newest entry tells you both "at limit?" and `nextFreeAt`.
- **The size is capped** at about 20 entries plus 31 day keys, under 2 KB, at any volume.
- **Kept on purpose:** the 10-entry cap only limits dedupe memory for very heavy importers. Their
  older re-imports are counted as new.

### 5.2 `recipePrinterConfig/importMeter`, read through a 60-second in-memory cache

```ts
{ mode: "off" | "measure"; windowDays: 30; pendingTtlSeconds: 300;
  candidateLimits: [5, 10]; enforce?: { limit: number } /* unused this rollout */ }
```

### 5.3 Accounts: never reset, never merged

| Situation | Counted against |
|---|---|
| Signed out | **all** entries in this browser's doc, whoever made them |
| Signed in as U | U's account doc, plus this browser's signed-out entries that are **claimable by U**: `o` absent, `prev` empty or `prev === U`, and not claimed by anyone else. They're claimed for U on the next write, and copied into U's doc so they follow U to other devices. |
| Every reserve while signed in as U | writes the entry to **both** U's doc and the browser doc (`o: U`), and sets `browser.lastUid = U` |

What that gives you:
- **Sign in doesn't reset.** Signed-out imports are claimed into the account.
- **Sign out doesn't reset.** The browser doc holds the signed-in imports too.
- **A new device carries the account's usage,** through U's doc.
- **Unrelated accounts aren't combined.** B signing in on A's device sees neither A's signed-in
  imports (`o: A`) nor the signed-out imports made after A signed out (`prev: A`). It sees only
  signed-out imports made before any account used the device, or after B itself.
- **One person signed out on a shared device shares that device's anonymous allowance.** It's
  unavoidable. Signing in separates people.
- **Known gap, accepted:** someone at the limit could create a brand-new account to get a fresh
  allowance. That's more effort than a private window, and closing it would mean combining
  accounts, which you asked us not to do.
- **Never double-counted:** every union is by import id.

### 5.4 Callable `recipePrinterImportMeter`

App Check is enforced, auth is optional, and `rpAnonId` is added by `withAnonId`.

```ts
type MeterRequest =
  | { op: "reserve"; importId: string; method: "url" | "image" | "text"; dedupeKey?: string }
  | { op: "settle"; importId: string; outcome: "success" | "failure" };

interface ReserveResult {
  mode: "off" | "measure";
  allowed: true;                       // always, this rollout
  reason?: "pro" | "off" | "duplicate" | "already_reserved";
  used30d: number;                     // counted before this import, from `days`, unbounded
  wouldBlock: { 5: boolean; 10: boolean };
  subjectKind: "browser" | "account";
}
// settle → { ok: true }. Infrastructure problems throw HttpsError; the client fails open.
```

**Reserve**, in one transaction:
1. Read the config (cached).
2. If signed in, read the user doc. If `hasActiveRecipePrinterPro`, return `pro` and write nothing.
3. Read the browser doc, plus the account doc when signed in. Prune pending entries older than 5
   minutes, and counted entries outside the window or beyond the newest 10.
4. If this `importId` already exists, return `already_reserved`.
5. If a counted entry in scope has the same `k`, return `duplicate` and write nothing.
6. Otherwise append a pending entry (the `o`, `prev` and claim rules from section 5.3). On a new
   doc, do the rare network write.

**Settle success:** `p` becomes `c`, increment `days[today]` and `total`, and apply the same to the
account doc when the entry has `o`. **Settle failure:** remove the entry. An unknown id is a no-op.

`mode: off` returns `{ mode: "off", allowed: true, reason: "off" }` without touching documents.

---

## 6. Exceptions

- **Pro, layer 1, client:** `hasProEntitlement(effectiveCustomerInfo.customerInfo)` true means
  `runParse` skips the meter. That's the same answer every Pro gate uses, and it covers a purchase
  before the webhook lands.
- **Pro, layer 2, server:** a signed-in reserve checks `hasActiveRecipePrinterPro` (the webhook
  mirror, which requires a future `expiresAt`). That covers a page whose RevenueCat state hasn't
  loaded yet, such as right after the mobile sign-in redirect.
  - **legacy template purchases:** never satisfy it
  - **one-month Pro:** satisfies it until it expires
  - **a cookbook purchase:** never satisfies it
- **Cookbook, card meter:** `meterExempt` is read through the queue's gate refs
  (`configureMultiRecipeGate`, renamed `configureImportGates`). Plus an explicit
  `{ meterExempt: true }` on the `scaffoldCookbook` replay, because that effect switches the book
  on before the next render updates the ref. Cookbook imports never use the card allowance.
- **Cookbook, free size (rev 4):** a second gate on the same refs, `bookCapReached` =
  `cookbookMode && cookbookLocked && recipeCount >= M`.
  - **What it gates:** every way of adding to a book. The rail's "Add recipes" (`PageRail.tsx:696`),
    the Add-recipe dialog's submit, the Apps tab's library picker (`addReadyRecipes`), the manual
    "add" path, and the homepage replay into a book.
  - **What happens:** each one calls the existing cookbook checkout,
    `purchaseCookbookAndContinue` ([lib/useCookbookPurchase.ts:163](../lib/useCookbookPurchase.ts)).
    On success it continues the add the cook asked for, the way "Buy & Print" continues the print.
  - **Server side:** none. Same soft-paywall standard as the rest. Export stays server-checked as
    today.
- **Measure mode restricts no one,** so neither exception can block anybody in this rollout. They
  only decide what gets measured.

---

## 7. IP monitoring: DROPPED (Amelia, 2026-10-10)

**Not built.** It needed its own secret, a second collection and TTL policy, and a privacy
disclosure about network addresses, for a flag that only matters once a limit is enforced. The
meter processes no IP addresses. Every later mention of network hashing, `net`,
`recipePrinterMeterNet` or `RECIPEPRINTER_METER_NET_KEY` in this plan is superseded by this note.
If storage-reset abuse shows up after go-live, revisit the design below.

*Original design, kept for reference:*

- **Normalize:** IPv4 /32, IPv6 /64, IPv4-mapped IPv6 becomes v4.
- **Store:** `HMAC-SHA256(RECIPEPRINTER_METER_NET_KEY, network)`, truncated. Raw IPs are never
  stored or logged.
- **Write only when** a subject doc is created, or a subject crosses 5 or 10 in measure terms.
  Each write is an `increment` on `recipePrinterMeterNet/{day}_{hash}` with
  `{ newSubjects, crossed5, crossed10, sample (≤20), expiresAt: +30d }`.
- **Flag, never block.** A network is flagged when, over 7 days, at least 4 subjects crossed the
  line and at least 8 new subjects appeared. Flagging writes one log line. That separates storage
  resets from households, workplaces, carrier NAT and VPN exits, which have many ids but rarely
  have several heavy importers.
- **Retention:** 30 days, by TTL.
- **Confirm in phase 1** that the callable's `rawRequest` gives the client's address, not Google's
  front end.

---

## 8. Free-tier messaging, UX and SEO (rev 3)

**Principle:** RecipePrinter stays a free recipe printer. The allowance is a fact the site states
plainly where you import, never its headline.

- **During measurement:** no allowance copy anywhere, and no UI change.
- **When the limit is switched on:** everything below goes live in one "go-live" PR (section 8.6).

### 8.1 One source for the wording

New module `lib/freeImports.ts`. Every surface reads it, so the numbers change in one place.
The copy below uses N = 10 for cards (leaning, D7) and M = 10 for cookbooks (decided, D8):

```ts
export const FREE_IMPORTS_PER_WINDOW = 10;          // keep in sync with CookPilot's config (logged on mismatch)
export const FREE_IMPORT_WINDOW_DAYS = 30;
export const FREE_COOKBOOK_RECIPES = 10;           // M: an unbought book's free size (D8)
export const IMPORT_ALLOWANCE_LIVE = false;        // flipped to true only in the go-live PR (gates BOTH limits)
export const FREE_IMPORTS_LINE = `${FREE_IMPORTS_PER_WINDOW} free recipe imports every ${FREE_IMPORT_WINDOW_DAYS} days. No account required.`;
```

Client enforcement requires **both** the server's `mode: "enforce"` **and**
`IMPORT_ALLOWANCE_LIVE`. A build from the measurement era therefore can't restrict anyone, even if
the config doc is flipped early, and the copy always ships in the same deploy as the ability to
enforce.

### 8.2 The four facts, and where each is stated

| Fact | Import panel popover | Limit dialog | FAQ "Is RecipePrinter free?" | `llms.txt` | Account plan card |
|---|---|---|---|---|---|
| 10 free recipe imports every rolling 30 days, no account | ✓ (lead line) | ✓ | ✓ | ✓ | ✓ |
| Editing, customizing and reprinting imported recipes is always free | ✓ | ✓ ("Your recipes are still here to edit and print") | ✓ | ✓ | ✓ |
| Pro: unlimited recipe imports | ✓ | ✓ (benefits list) | ✓ | ✓ | ✓ (Pro card) |
| Cookbooks: preview free with up to M recipes; buying the book unlocks downloading and as many recipes as you like | ✓ | no (the card dialog never mentions cookbooks, per rule 2A.2) | ✓ | ✓ | n/a |

Cookbook facts are also stated where cookbooks are made: the welcome dialog, the rail count, and
the cookbook SEO pages (section 8.5, C8 to C14).

**"Unlimited recipes" is only ever said of a bought book.** Photos into any book stay paced at
5 an hour (section 1.4), so the wording is "add as many recipes as you like", never "unlimited
imports".

### 8.3 The import panel: subtle but discoverable

`ImportPanel` is the one component behind the homepage (`PrinterWorkspace`), every SEO capture
block (`components/seo/SeoCapture.tsx`) and the print page's Add-recipe dialog
(`components/AddRecipeDialog.tsx`). So one footer line covers every import door.

- **Placement:** one caption-size, `text-ink-soft` line in the panel's footer, shared by all tabs.
  It does **not** go under the link field, where the "Works with Instagram, TikTok…" caption and
  errors already live. There's a small info button beside it.
- **The homepage hero, headings and calls to action don't change.**

**Requirement (Amelia, 2026-10-10): a cook can always see how many imports they've used toward
the limit, signed in or signed out.** The count is never hidden until someone is nearly out.

| State (non-Pro, card mode) | Footer line | Action |
|---|---|---|
| Nothing used yet | **10 free recipe imports every 30 days. No account required.** | ⓘ |
| 1 or more used, 3 or more left | **4 of 10 free imports used. No account required.** | ⓘ |
| 1 or 2 left | **8 of 10 free imports used. Your next one's back on Oct 21.** | ⓘ |
| 0 left | **10 of 10 free imports used. Your next one's back on Oct 21.** | quiet **Get unlimited imports** text button, which opens the existing Pro dialog |
| Pro, cookbook mode, or allowance not live | nothing | none |

- **The count is the same number signed in or out.** Signed out it's this browser's count; signed
  in it's the account's, including what was imported before signing in (section 5.3). It never
  drops when someone signs in or out.
- **Where it shows:** every import door (the panel footer above), the print page's own paste
  field in the rail, and for signed-in cooks the account page ("4 of 10 used. Next one back
  Oct 21."). Signed-out cooks have no account page, so the import doors are where they see it.

- **Info popover:**
  - **10 free recipe imports every 30 days. No account required.**
  - Each import comes back 30 days after you used it.
  - Editing, customizing and reprinting recipes you've already imported never uses an import.
  - RecipePrinter Pro includes unlimited imports.
  - Making a cookbook instead? You can preview one free with up to 10 recipes, and it doesn't use these.
  - When the visitor has used any imports, it ends with "Your next free import is back on
    {date}." The date comes from `nextFreeAt` and is formatted like `formatResetTime`.
- **The account page shows both kinds of usage (Amelia, 2026-10-10).** Each plan card keeps the
  usage for what that plan is limited by, under the benefit line it belongs to:
  - **Free card:** the allowance count ("4 of 10 used. Next one back Oct 21.") **and** this
    hour's photo imports ("2 of 5 used this hour"), which stays. The hourly photo limit still
    applies inside the allowance, so hiding it would make a photo refusal a surprise.
  - **Pro card:** this hour's photo imports ("N of 30 used this hour"), unchanged. Pro has no
    allowance count because Pro imports aren't limited.
  - **Check at go-live, signed in as Pro and as free:** the usage block is visible on your own
    plan's card. It renders under `PRO_IMAGE_IMPORT_BENEFIT` and `FREE_IMAGE_IMPORT_BENEFIT`
    (`components/AccountProStatus.tsx`), so a copy change to either benefit line must keep those
    constants in the list or the block silently disappears. If it's found missing before then,
    that's a bug to fix with a test, not go-live work.
- **No banners, toasts or badges.** The count lives in the one footer line, and the print page's
  paste field in the rail shows the same line in every state once anything has been used.
- **Never a surprise:** the count is visible from the first import, the line names the date from
  2 left, and the 0-left line names it before the cook even tries. The submit button stays
  enabled at 0, so a stale cached count can never wrongly lock someone out; the server is always
  asked first.
- **Where the number comes from:** the server, never a browser-side tally. Reserve and settle
  responses carry `used` (the exact rolling count, from `entries`), `limit` and `nextFreeAt`, and
  the panel caches the latest one in this browser. `op: "status"` (added at go-live) returns the
  same three for a page that hasn't imported yet this visit.
- **Cost:** a first-time visitor (no cached status, signed out) makes no meter call on page load
  and sees the at-rest line. The panel asks `status` once per page load only when this browser
  has a cached status, or the cook is signed in (their account may have imports from another
  device). Anonymous homepage traffic that has never imported costs no Firestore reads.

### 8.4 When the limit is reached: the existing Pro dialog only

- **No new paywall.** It's `ProUpgradeDialog`, through `openProUpgradeDialog(IMPORT_LIMIT_TRIGGER)`,
  with a new entry in `lib/proUpgradeCopy.ts`:
  - title: **"You've used your 10 free imports"**
  - body: **"Your next one's back on Oct 21. Your recipes are still here to edit and print. Go Pro
    for unlimited recipe imports."**
  - benefits: the existing `PRO_BENEFITS`, with **"Unlimited recipe imports"** added first
  - footer, signed out: **"Already have Pro? Sign in"**
  - **removed (rev 4):** the "Making a cookbook? Imports there don't count." link. It taught the
    loophole, and the card dialog doesn't mention cookbooks (rule 2A.2).
- **What happens around it:** the stash and replay after purchase or sign-in follow rev 1,
  section 8.4. Because reserve is always awaited, a denied import never starts a parse.
- **The dialog never blocks** printing, editing or saving what the cook already has.

### 8.4b A cookbook's free size: no new dialog (rev 4)

Everything reuses what's already there:

| Where | Today | With the free size |
|---|---|---|
| `CookbookWelcomeDialog.tsx:96,101` (shown when someone starts their first book) | "$19.99 one time. Pay when you download." | "$19.99 one time. **Preview it free with up to 10 recipes. Buy it to download your cookbook and keep adding.**" The Pro 20%-off line keeps its wording with the same second sentence. |
| Cookbook rail count line (`PageRail.tsx:169`, above "Add recipes"), unbought | "8 recipes" | "Free preview: 8 of 10 recipes". Shown at all counts, because it's the only place the cap lives, and it's quiet. |
| Rail button at the cap (`PageRail.tsx:696`) | "Add recipes" | **"Buy & add recipes"**, which goes straight to cookbook checkout, like "Buy & Print" |
| Add-recipe dialog or Apps picker opened at the cap | n/a | the same checkout instead of opening |
| After purchase | n/a | the add the cook asked for continues, and the count line goes back to "N recipes" |
| Bought book | count line | unchanged |

- **Never a surprise:** the rule is stated in the welcome dialog before the first recipe, and the
  rail shows the count the whole time.
- **What happens at the cap:**
  - **checkout:** the button names what it does, and checkout itself shows the price. That's the
    same pattern people already meet at Print.
  - **cancelling:** returns them to the book with nothing lost.
  - **signed out:** as today with "Buy & Print", checkout allows a signed-out purchase, and the
    adopt-on-sign-in path carries it to their account later.

### 8.5 Copy audit: what becomes misleading once enforcement is on

**Must change in the go-live PR:**

| # | File | Current claim | Accurate replacement (search intent and tone kept) |
|---|---|---|---|
| C1 | `lib/seo.ts:389`, FAQ "Is RecipePrinter free?". Shared by `/faq` and the homepage FAQ, and emitted as **FAQPage JSON-LD**. | "Yes. You can import, edit, and print full-page recipes for free, with no account required. RecipePrinter Pro is optional and adds…" | "Yes. You get 10 free recipe imports every 30 days, with no account required, and you can edit, customize and print your recipes as often as you like. RecipePrinter Pro is optional: it adds unlimited imports, 4 by 6 recipe cards, every theme, batch printing, and the full card toolkit for $4.99 a month or $39.99 a year. Making a cookbook? You can preview it free with up to 10 recipes; downloading it is $19.99 once, and then you can add as many recipes as you like." Follows the one-sentence model in 2A. |
| C2 | `lib/seoLandingPages.ts:707`, the print-multiple-recipes page FAQ (also FAQPage JSON-LD via `app/[slug]/page.tsx`) | "You can import and print recipes one at a time for free, **as many as you like**." | "You can print recipes one at a time for free, as often as you like, with 10 free recipe imports every 30 days. Printing several together as one collection is part of RecipePrinter Pro, which also includes unlimited imports." |
| C3 | `lib/seoLandingPages.ts:3064`, the Just the Recipe comparison FAQ | "RecipePrinter is free to print full-page recipes, with no account **and no limit**." | "RecipePrinter is free to print full-page recipes, with no account and 10 free recipe imports every 30 days." The competitor half is unchanged. |
| C4 | `app/llms.txt/route.ts:39` | "Importing, editing and printing a normal full-page recipe, one at a time, is free and requires no account." | "Printing a normal full-page recipe is free and requires no account, with 10 free recipe imports every 30 days; editing and reprinting imported recipes never uses an import. RecipePrinter Pro (…) adds unlimited imports and unlocks…" The cookbook sentence becomes: "A cookbook can be previewed free with up to 10 recipes; downloading or printing it takes a one-time purchase of $19.99 per cookbook, which also lets you add as many recipes as you like; it is separate from Pro and doesn't use the card allowance." |
| C5 | `components/AccountProStatus.tsx:44`, `BASIC_BENEFITS` | "Unlimited imports from any recipe website" / "Unlimited imports from Instagram, TikTok, Pinterest & more" / "5 image imports an hour" | "10 free recipe imports every 30 days" / "Import from any recipe site, Instagram, TikTok, Pinterest & more" / "Edit and reprint your recipes as often as you like". **The hourly photo line and its usage block stay** (revised 2026-10-10, section 8.3), as a fourth line: "5 image imports an hour". A second usage block shows the allowance ("3 of 10 used. Next one back Oct 21.") under the first line. Also rewrite the comment above it, which explains "importing has no limit". |
| C6 | `lib/proUpgradeCopy.ts:31`, `PRO_BENEFITS` (shown on the Pro dialog **and** the Free plan card) | no import line | add "Unlimited recipe imports" first. `PRO_IMAGE_IMPORT_BENEFIT` stays as "30 image imports an hour". |
| C7 | `lib/seo.ts:470`, `webApplicationNode` comment | "Importing, editing and full-page printing stay genuinely free (no account, no paywall)" | rewrite the comment only. **Keep `isAccessibleForFree: true` and the $0 "RecipePrinter Free" Offer**, because the core use is still free. Add `description` to both Offers ("10 recipe imports every 30 days, unlimited editing and full-page printing"; "Unlimited recipe imports, every theme, 4×6 cards, batch printing"). No new schema types. |
| C8 | `lib/seoLandingPages.ts:2222`, make-your-own-cookbook page | "Cookbook export costs $19.99 per cookbook. That one-time purchase unlocks the cookbook and lets you keep editing it and export updated PDFs again later." | "Start your cookbook free and preview it with up to 10 recipes. $19.99 per cookbook, one time, lets you download it, add as many recipes as you like, keep editing, and export updated PDFs whenever you want." |
| C9 | `lib/seoLandingPages.ts:2356`, cookbook maker page (under the heading "$19.99 for one editable cookbook", **heading kept**) | "Cookbook export costs $19.99 per cookbook. That one-time purchase lets you keep editing…" | the same sentence as C8 |
| C10 | `lib/seoLandingPages.ts:2257` and `:2396`, price FAQs | "Cookbook export costs/is $19.99 per cookbook…" | "$19.99 per cookbook, one time, to download it and add as many recipes as you like. You can preview it free with up to 10 recipes first. Printing and binding from an outside service cost extra." (`:2257` keeps its last sentence) |
| C11 | `lib/seoLandingPages.ts:2247`, "Do I need to buy to download?" FAQ | "Purchasing the cookbook unlocks PDF export for that cookbook…" | "Purchasing the cookbook unlocks PDF export, and as many recipes as you like, for that cookbook…" The account sentence is unchanged. |
| C12 | `lib/seoLandingPages.ts:2197`, how-to step | "Purchase the cookbook once, download the finished PDF…" | keep it. Still true for books under the free size. Optionally prepend "Preview it free with up to 10 recipes, then…" |
| C13 | `lib/seoLandingPages.ts:2391`, Pro and cookbooks FAQ | "Cookbook purchases and RecipePrinter Pro are separate. Pro covers other RecipePrinter features and does not include cookbook export." | keep it, and add: "Either way, you can preview a cookbook free with up to 10 recipes before you buy it." |
| C14 | `components/CookbookWelcomeDialog.tsx:96,101`, and `CookbookPitch` if it states the price model | "Pay when you download." | section 8.4b wording |

**Cookbook copy that stays:**
- `:507` "Cookbook exports are purchased separately"
- `:2031` and `:2138` "$19.99 a cookbook… yours to edit and add to afterwards"
- `:2252` "keep editing… without purchasing again"
- the comparison rows "$19.99 a cookbook, edits included"
- the cookbook pages' titles and h1s, which don't use "free" and don't need to

**New and honest:** "start your cookbook free" and "preview it free" are claims the cookbook
pages can now make, which helps the free positioning. Add them to page **body copy only** (C8 to
C10), not titles, so search intent isn't disturbed.

**Never say a cookbook is "free up to 10 recipes" or "free to build" on its own.** Both read as
"a 10-recipe cookbook is free to download", and it never is. Every cookbook statement pairs
**preview** (free) with **download** ($19.99). "Preview" also matches the watermark an unbought
book prints with.

**Must change at measure time (privacy accuracy, not allowance messaging):**

| # | File | Issue |
|---|---|---|
| P1 | `app/llms.txt/route.ts:40` | "Used without an account, **nothing is stored on a server**." Already shaky, since failed imports are kept in `debugInbox`. Once the meter runs, it stores import counts too. Change it to "no recipes are stored on a server". |
| P2 | `app/privacy` | add the one sentence from B4: we count imports per browser and keep a one-way network hash for 30 days. Neutral wording that announces no limit. |

**Checked and still accurate. Keep these as they are; they carry the free positioning:**
- `app/layout.tsx:214,221`: "Free Recipe Printer for Online Recipes"
- `lib/seoLandingPages.ts:976,1076`: "Free Pinterest/Instagram Recipe Printer"
- `:377`: "Free, and no account needed to print"
- `:1078`: "Free, and no account needed". Still true: Instagram imports are free within the allowance.
- `:518`, `:581`, `:1194`, `:1806`, `:3012`: one-at-a-time printing is free
- `:3034`, `:3139`, `:3154`: "Free, no account"
- `:3168`: ReciScan, "free to print"
- `lib/seoFeatureCards.ts:77,85`
- `lib/seo.ts:364`
- every "Start printing for free" CTA (`components/seo/LandingClose.tsx`, `/faq`, `/features`, `/how-it-works`)
- `app/about` "free to print with"
- `ImportPanel`'s "Works with…" caption
- `HolidayCookbookBanner` "$19.99 for unlimited recipes": now literally what the purchase adds (rev 4)

**Watch:** `lib/seoLandingPages.ts:3043`, "Saving recipes to come back to: Unlimited with a free
account", is about **saving**, which stays unlimited, so it's accurate. It sits on the same page
as C3, though. If a reviewer finds it reads as imports, change it to "Unlimited saves with a free
account".

**Nowhere** does the site say "100% free" or "unlimited free", and the go-live PR must not
introduce either.

### 8.6 The go-live PR (prepared only after the limit is chosen)

One PR, merged at the moment we decide to enforce. Writing it then, not now, keeps it from
drifting against `seoLandingPages.ts` edits in the meantime.
1. Set `IMPORT_ALLOWANCE_LIVE = true` and the final limit in `lib/freeImports.ts`.
2. Copy changes C1 to C14, and the cookbook UI from section 8.4b.
3. **Sitemap honesty:**
   - bump `contentUpdated` on the landing pages whose copy changed:
     - the print-multiple-recipes page
     - the Just the Recipe comparison
     - make-your-own-cookbook
     - cookbook maker
     - any other page carrying C10 or C11
   - bump `LAST_MODIFIED` for `/faq` and `/` in `app/sitemap.ts`
   - the existing IndexNow step then submits exactly those pages on deploy
4. UI from sections 8.3 and 8.4: `ImportPanel` footer line and popover, the rail paste field line,
   the dialog copy, the `status` op client call, the `AccountProStatus` usage line.
5. Order on the day:
   1. merge (production deploy)
   2. confirm the copy is live
   3. set `mode: "enforce"` with the chosen limit
   4. watch for 48 hours
6. Rollback:
   - set `mode: "measure"` or `"off"` (instant, no deploy)
   - if staying off for more than a few days, revert the PR so the copy stops mentioning a limit
     that isn't applied

**Measurement mode ships none of this.** The only visible changes before go-live are P1 and P2.

---

## 9. Implementation plan (this rollout: measurement only)

### Step A: PostHog clean-up of existing data (RecipePrinter, small, ships first)
- [lib/analytics.ts](../lib/analytics.ts): optional `importId`, `extra` and `cookbook` on
  `recipe_imported`. Plus, for cookbook imports, `bookRecipes` (the book's count after this
  import) and `bookBought`. That lets us watch how big unbought books get, and how many each account starts
  (D9).
- [lib/queue.ts](../lib/queue.ts): pass them at 731, 776 and 1022. Cookbook mode reaches the hook
  through the gate refs.
- Build the PostHog insights from 4.2 on the historical data straight away. I can draft the HogQL
  for you; see blocker B5.

### Step B: meter in CookPilot, deployed with `mode: "off"` (needs B1 and B2)
- `functions/src/recipePrinterImportMeter.ts` (new):
  - a pure `decideReserve` and `applySettle` over plain data
  - a thin transaction wrapper
  - config cache
  - subject hashing
  - network hashing and rare writes
- `functions/src/recipePrinterPro.ts` (new): move `hasActiveRecipePrinterPro` here from
  `parseRecipeFromImages.ts` and import it in both places. No behaviour change.
- `functions/src/index.ts`: export it, and `defineSecret("RECIPEPRINTER_METER_NET_KEY")`.
- `functions/src/parseRecipeFromURL.ts`: in `recipePrinterParseRecipeFromURL`, log `hasImportId`
  (one structured line). No parsing change.
- Tests: section 10.1.
- Firestore:
  - create `recipePrinterConfig/importMeter` with `mode: "off"`
  - TTL policies on `expiresAt` for `recipePrinterImportMeter` and `recipePrinterMeterNet`

### Step C: client wiring (RecipePrinter), still `mode: "off"` in production
- `lib/importMeter.ts` (new):
  - `reserveImport` / `settleImport` over `callCookPilotParser`, the way `loadImageImportQuota`
    does it
  - a 5-second timeout and fail-open
  - `dedupeKeyFor` (`crypto.subtle`)
  - `meterGateFor({ cookbookMode, clientPro, override })`, which returns `"skip"` or `"reserve"`
- [lib/queue.ts](../lib/queue.ts):
  - rename `configureMultiRecipeGate` to `configureImportGates({ singleRecipeOnly, meterExempt })`
  - `runParse`: await reserve, then `work()`, then settle (in `try` and `catch`); attach the
    meter fields to events
  - `add*` options gain `{ meterExempt }`
- [app/print/page.tsx](../app/print/page.tsx):
  - pass `meterExempt = cookbookMode || hasProEntitlement(...)`
  - the override on the `scaffoldCookbook` replay
- [lib/parser.ts](../lib/parser.ts): `parseUrlLocally` sends `x-rp-import-id`.
  [app/api/parse/route.ts](../app/api/parse/route.ts) forwards `importId` in the CookPilot body.
  Nothing else changes in either file.
- [lib/analytics.ts](../lib/analytics.ts): the fields from section 4.1, and `import_meter_unavailable`.
- [app/privacy](../app/privacy): one sentence about counting imports and keeping a keyed network
  hash for 30 days (B4, P2).
- [app/llms.txt/route.ts](../app/llms.txt/route.ts): "nothing is stored on a server" becomes "no
  recipes are stored on a server" (P1).
- `lib/freeImports.ts` (new): the constants from section 8.1, with `IMPORT_ALLOWANCE_LIVE = false`.
  Nothing renders from it yet; the client gate reads it.
- `components/print/PrintConfigPanel.tsx`: delete the stale "Leaves the book" comment, and add the
  guard comments from section 1.3.
- `docs/import-meter.md`: the runbook (modes, rollback, TTL commands, flag query, histogram script).

### Step D: turn on measurement
- Set `mode: "measure"`.
- Check the first day:
  - meter p50/p95 `meterMs`
  - `import_meter_unavailable` rate
  - `used30d` values that look sane
  - the `hasImportId` ratio for `/api/parse`
  - the network log line showing client addresses
- Run 30 days or more, so the rolling window fills.

### Step E (later, separate approval): choose the limit, then the go-live PR (section 8.6)
- Add `op: "status"` to the callable (section 8.3), with `used`, `limit` and `nextFreeAt` on it
  and on the reserve and settle responses, so every import door can show "N of 10 used" to
  signed-in and signed-out cooks alike. Add `enforce` to `mode`, including rule E1 from
  section 1.2.
- Allowance UI and copy C1 to C14, sitemap dates, `IMPORT_ALLOWANCE_LIVE = true`.
- The cookbook free-size gate (sections 3.2, 6 and 8.4b), set from `FREE_COOKBOOK_RECIPES`. It's
  browser-only, with no CookPilot change.
- Adjust the existing tests this touches. New tests only for the enforce branch of the approved
  meter suite (deny at the limit, E1 fail-open rule, the `IMPORT_ALLOWANCE_LIVE` and server-mode
  gate).

---

## 10. Testing, edge cases, rollout, rollback

### 10.1 Approved unit-test suite (focused on metering logic)

**CookPilot, `src/__tests__/recipePrinterImportMeter.test.ts`** (Jest, in the style of
`recipePrinterQuota.test.ts`). The decision logic is tested as pure functions over plain data. One
block drives the transaction wrapper through an **optimistic-concurrency fake** of
`runTransaction`: it versions each doc and retries a transaction whose read was overtaken, the way
Firestore does. The existing quota mock interleaves without conflicts, so it can't catch a race.

| Area | Cases (each a table loop where the rule has variants) |
|---|---|
| Concurrency | two reserves interleaved at 4 counted, under candidate limit 5: both allowed (measure), and `wouldBlock[5]` is true for exactly one. A concurrent settle and reserve keep `days` exact. A duplicate `importId` in flight gives one entry. |
| Rolling expiry | counted imports at day 0 to 4: `wouldBlock[5]` true at day 29 23:59, false at day 30 plus 1 minute. `days` keys older than 31 days are pruned. `used30d` stays unbounded past 10 (for example 37 imports gives 37). Entries are capped at the newest 10 counted, without losing exactness for limits 5 and 10. |
| Failed imports | `settle(failure)` removes the entry. A pending entry with no settle stops counting after 5 minutes. A failure never increments `days`. A failure then a retry with a new id counts once. |
| Dedupe | the same `k` within the window gives `duplicate` and no write. The same `k` after the window is counted. |
| Existing Pro | an active `pro` with a future `expiresAt` gives `pro` and **zero writes**. Expired: metered. Legacy `template_*` only: metered. `pro` with no `expiresAt`: metered. One-month promotional: unlimited until expiry. |
| Accounts | signed out 3, then sign in: U sees 3. Signed in 3, then sign out: browser sees 3. A's imports invisible to B on the same browser. Signed-out after A signs out are attributed to A, not B. A new device signed in as U sees U's. A union never double-counts. |
| Mode | `off` touches nothing. `measure` never denies. |

**RecipePrinter, `lib/importMeter.test.ts`** (Vitest, parser and meter mocked, never live).
Cookbook exemptions live in the client, so they're tested here:

| Area | Cases |
|---|---|
| Cookbook exemption | for each of cookbook mode, the scaffold override and client-known Pro: `runParse` never calls reserve or settle. Free card mode calls both. |
| Ordering | the parser mock isn't called until reserve resolves, for each of url, image and text. |
| Failure | a parser throw gives `settle(failure)`. A roundup gives exactly one `settle(success)`. |
| Fail open | reserve rejects or exceeds 5 s: the parse still runs, and `import_meter_unavailable` fires. |
| Cookbook free size (go-live PR) | one table loop: an unbought book at M-1 allows one more add, and at M sends **every** add path (rail, dialog, Apps picker, manual, homepage replay) to checkout. A bought book at any count is never gated. A book already above M keeps its recipes. A roundup past M keeps only what fits. Pro in an unbought book is still gated. A card project is never gated by M. |

`npm run verify` here, and CookPilot's `npm test`, which its predeploy and CI already run.

### 10.2 Manual checks (emulator or local, never production)
- One import of each kind (link, social link, photo, screenshot, text) with the meter wired to the
  Functions emulator: the events carry the meter fields.
- The mobile sign-in redirect mid-import: no settle, and the pending entry expires.
- Paprika, CookPilot library, shared card and manual: no meter call.
- The production monitor is unaffected. Its import check calls `recipePrinterParseSuppliedHTML`
  directly, and the meter isn't on that path.

### 10.3 Rollout
1. Step A ships with the next normal deploy. Build the insights on history.
2. Step B deployed to CookPilot with `mode: "off"`. Verify one reserve from a local dev build
   against production App Check, which needs a debug token.
3. Step C merged, inert in production while the mode is `off`.
4. Step D sets `measure`. Watch day one, then let it run 30 days or more.
5. A review produces a limit proposal, and then an enforcement plan comes back for approval.

### 10.4 Rollback
- **Instant:** `mode: "off"` in the config doc. Calls return within 60 seconds, with no document
  reads or writes. No deploy.
- **Automatic:** any error, or a reserve slower than 5 seconds, fails open.
- **Code:** revert the RecipePrinter PR. The CookPilot function can stay deployed and idle.
- **Data:** TTL removes everything within 31 days.

---

## 11. Firebase usage (measure mode)

| Per free card-mode import | Invocations | Reads | Writes |
|---|---|---|---|
| signed out: reserve + settle | 2 | 2 | 2 |
| signed in: reserve + settle | 2 | 5 (user, browser, account; then browser, account) | 4 |
| new subject or crossing a line (rare) | 0 | 0 | +1 increment |
| Pro detected by the server / cookbook / client-known Pro | 1 / 0 / 0 | 1 / 0 / 0 | 0 |

There are no status calls in measure mode. Blended, about 2 invocations, 2.5 reads and 2.3 writes
per free import.

| Free imports a month | Reads | Writes | Approximate cost |
|---|---|---|---|
| 10,000 | ~25k | ~23k | $0, inside the daily free tier (50k reads, 20k writes a day; shared with CookPilot) |
| 100,000 | ~250k | ~230k | about $0.15 to $0.55 a month |
| 1,000,000 | ~2.5M | ~2.3M | about $1.50 to $5.50 a month |

- Function invocations stay in the 2M-a-month free tier until the top row. Documents are under
  2 KB, and TTL deletes are about one per subject a month.
- Optional `minInstances: 1`: about $5 to $10 a month (D4).
- Reasonable at every size we're likely to see.

---

## 12. Remaining blockers and decisions

**Blockers, before anything ships:**
- **B1 (yours):** go-ahead for a CookPilot deploy to `cookpilot-bbecb`: one new function, a change
  to one log line, and a moved helper.
- **B2 (yours):** *(the secret is no longer needed; only the TTL policy on
  `recipePrinterImportMeter` remains.)* Originally: create the secret `RECIPEPRINTER_METER_NET_KEY`
  (`firebase functions:secrets:set`, with a random 32-byte value). Also the two Firestore TTL
  policies (`gcloud firestore fields ttls update expiresAt --collection-group=…`). Both need your
  credentials. I'll put the exact commands in the runbook.
- **B3 (mine, at the start):** check that the CookPilot working tree matches what's deployed
  before editing, because CookPilot deploys from its working tree. Also check this repo's tree for
  another session's edits to `lib/queue.ts` and `app/print/page.tsx`.
- **B4 (yours):** approve the privacy-policy sentence before `measure` goes on, since we'll start
  processing IP addresses for this purpose.
- **B5 (yours or a key):** the PostHog insights. I mustn't load production, so either you build
  them from my HogQL, or you give me a personal API key with insight-write scope.
- **B6 (dropped with section 7):** confirm the callable's client-address source, using the first log lines
  after step D.

- **B7 (yours, go-live only):** approve the final wording of C1 to C14 and of the sections 8.3, 8.4 and 8.4b
  8.4 strings. They're drafted here, and they follow the copy voice rules: no em dashes,
  contractions, never blaming the cook.

**Open decisions (recommendations in italics):**
- **D1:** leave Paprika and CookPilot-library imports unmetered? *Yes.*
- **D2:** is re-importing the same link or text within 30 days free? *Yes.*
- **D3:** should a bought cookbook raise its owner's photo limit? *Not now.*
- **D4:** `minInstances: 1` for the meter? *Only if p95 `meterMs` is above about 1.5 s.*
- **D5:** build the `/api/parse` ticket? *Only if `hasImportId: false` is a meaningful share.*
- **D6:** should the at-rest footer line ("10 free recipe imports every 30 days. No account
  required.") show to first-time visitors on the homepage, or only once they've imported
  something? *Show it. It reads as a free offer, it's the cheapest way to make sure the limit is
  never a surprise, and it sits below the import box, not in the hero.*
- **D7:** card allowance N. *10, from section 1.5. Confirm with 30 days of measure-mode data.*
- **D8 (decided 2026-10-09):** cookbook free size M = **10**.
  - **Why:** the purpose is to ask for payment at a reasonable point, so we stop storing and
    parsing books for people who never pay. It isn't meant to catch people at "done".
  - **What a cook has by 10:** a cover, chapters, a contents page and real pages, enough to judge
    the product.
  - **One number everywhere:** "10 free imports every 30 days" and "preview a cookbook free with up to 10 recipes".
  - **Data:** the only cookbook purchase so far held 175 recipes. That's too little to choose from,
    and it shows a committed builder isn't lost by being asked at 11.
- **D9 (watch, don't build):** someone could start book after book, 10 recipes each.
  - Measure unbought books per account, using `bookBought: false` with distinct project ids on
    import events.
  - If a pattern appears, the fix is "one unbought book at a time".
- **Note on stored data:**
  - a signed-in cook's book saves to their account from creation (Firestore, plus Storage for
    photos)
  - a signed-out cook's book lives in their browser
  - M = 10 bounds the server-side cost of every book that's never bought
