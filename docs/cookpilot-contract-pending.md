# RecipePrinter changes waiting on CookPilot's updated contract

Written 2026-10-12, after the shared-parser audit. Nothing here is implemented. Each item says what
RecipePrinter does today, what it needs from CookPilot, and the exact change to make once the
contract is known. Field names below are what CookPilot's code uses today (`HttpsError` details);
confirm them against the contract before building on them.

RecipePrinter adds no validation of its own in any of these. It only reads what CookPilot says.

## 1. Structured failures on the URL endpoint

**Today.** `recipePrinterParseRecipeFromURL` answers a failure with `{error, code}` only. The
`HttpsError` details (`reason`, `vendor`, `confidence`, `stage`, `provider`) are dropped by
CookPilot's HTTP wrapper before they reach us. `parseWithCookPilotServer` in
`app/api/parse/route.ts` therefore knows a status, a `code` and a sentence.

**Needed from CookPilot.** The details on the wire, for every failure. Two failures carry no
`reason` at all today and need one: "We couldn't find that page." (the page 404s) and "Could not
resolve the URL hostname".

**RecipePrinter change, once they arrive.**

| CookPilot says | Route does | `failure` |
|---|---|---|
| 404, reason for a page that does not exist | final, CookPilot's message | `not_found` |
| 404, any other reason (`no-recipe-on-page`, `no-recipe-in-caption`, `caption-unreadable`, `recipe-in-comments`, `recipe-on-profile`, `recipe-by-message`, `share-link-unresolved`, `parse-not-recipe-like`, `no-ingredients-or-steps`) | final, CookPilot's message | `no_recipe` |
| 412 `bot-challenge`, `confidence: "strong"` | final, CookPilot's message, `botWall.vendor` from `vendor` | `blocked` |
| 412 `bot-challenge`, `confidence: "weak"` | try our own fetch, then the supplied-HTML endpoint; CookPilot's message if that finds nothing | `blocked` |
| 412 `login-required`, `facebook-login-required`, `paywall` | final, CookPilot's message, no `botWall` | `blocked` |

Why the weak wall is the one that gets our fetch: a weak verdict is CookPilot's datacenter egress
being refused (a 403 or 429 with no fingerprint), which is the case a request from Vercel can
actually recover. A strong wall is a JavaScript challenge; a browser-shaped request from here was
measured against forty sites and passed none (commit 959c6e6). A sign-in or a paywall is the same
from any network.

Until then: every 404 with `code: "not-found"` is final and reported as `no_recipe` (so a missing
page is counted as `no_recipe`, not `not_found`), and every 412 is final with `botWall.vendor:
"generic"`, including sign-ins and paywalls.

### What "final on 404" covers today, and what it cannot tell apart

The route stops only when all three hold: the status is 404, the body is JSON with a non-empty
`error`, and `code` is exactly `"not-found"`. That is CookPilot's own `HttpsError("not-found")` and
nothing else. Everything below still goes on to our own fetch, as before:

- the request to CookPilot threw (network failure, DNS, our 55 s timeout);
- any 5xx, and CookPilot's 503 `unavailable` and 504 `deadline-exceeded`;
- a 404 with no `code` (a mistyped endpoint, a function that is not deployed, a proxy's own page);
- a 404 or 200 whose body is not JSON;
- 400 and every other 4xx except 401, 403, 412 and 429, which were already handled on their own.

Inside CookPilot's own `not-found`, these are answers we now treat as final that are partly about
access rather than about the recipe. Without a `reason` the route cannot separate them from "the
page has no recipe":

| CookPilot's `not-found` | Why it is ambiguous |
|---|---|
| "Could not resolve the URL hostname" | CookPilot's DNS lookup failed. Ours had just succeeded, so this can be a passing resolver fault on its side. |
| "We couldn't find that page." | The site answered 404 or 410 to CookPilot. A site that answers that way only to datacenter addresses would have served our fetch. |
| "That share link doesn't point to a recipe we can open." | Also returned when the share provider could not be reached. |
| "We couldn't read this post — it may be private, removed, or the site wouldn't show it to us." | Says itself that it may be an access failure. Our fetch of a social page was never going to read it, so nothing is lost, but it is counted as `no_recipe`. |
| "We couldn't find a recipe on this page." after the AI tier errored | Indistinguishable from the AI tier answering "no recipe". |

The first three are the ones to map to "try our own fetch" or `not_found` once reasons exist.

Also pass `reason` through `ParseResponse` so `recipe_import_failed` can group by it. That needs a
new optional field in `types/recipe.ts` and in `lib/analytics.ts`.

The callable fallback (`parseUrlWithCookPilot`, used only when the route is unconfigured) already
receives the details on the thrown error. `classifyError` in `lib/parser.ts` ignores them and drops
CookPilot's message for `not-found`. Bring it in line with the table above at the same time.

## 2. The supplied-HTML endpoint

**Today.** `recipePrinterParseSuppliedHTML` returns 200 with whatever `parseRecipePage` produced:
no shipping verdict, no contract check, no sign-in check, and only the first recipe of a roundup.
RecipePrinter accepts any 200 that adapts to a recipe.

**Needed from CookPilot.** 200 only for a parse its own gate would ship; `recipes` for a roundup; a
stated answer for a parse it holds but will not ship, and for a sign-in page.

**RecipePrinter change.**

- `parseSuppliedHtml` already reads the response through `adaptCookPilotRecipes`, which takes
  `{recipes: [...]}` as well as `{recipe}`. If the endpoint returns `recipes` unasked, nothing
  changes here. If it needs opting in, add `multiRecipe: true` to the request body, as the URL leg
  sends.
- If a withheld parse comes back as a new verdict or reason (not `kind: "none"`), add it to
  `PageVerdict` and `failureForVerdict`. A sign-in verdict maps to `blocked`.
- `adaptCookPilotRecipe` (`lib/cookpilot.ts`) accepts a response with a title and nothing else.
  CookPilot's contract already refuses that on the URL path; once the supplied path is gated too,
  tighten the adapter to "at least one ingredient or one step" so it cannot disagree with the
  contract. Not before: the image and pasted-text paths share this adapter.

## 3. Several recipes

The URL leg already asks with `multiRecipe: true` and reads `recipes`. Two gaps, both CookPilot's:

- the supplied-HTML endpoint drops recipes after the first (section 2);
- `parser.resolvedSourceURL` is set on the single-recipe web response when a wrapper link was
  followed, and left off the `multiRecipe` one. RecipePrinter now credits `resolvedSourceURL` when
  it is present, so a followed wrapper is credited correctly only once CookPilot sends it there too.

## 4. Pasted text with a link in it

**The second request is temporary.** It exists only because RecipePrinter cannot yet tell CookPilot
not to follow links. It is to be replaced by a single extraction request as soon as CookPilot
supports that; do not build on it.

**Today.** CookPilot follows an `http(s)` link in a paste it could not read strongly and answers
with that page (`parser.source: "social-outbound-link"`). RecipePrinter now detects that and reads
the paste a second time with the links removed (`parseText` in `lib/parser.ts`). The first call's
fetch of the link is wasted.

**What the second request costs the cook (checked 2026-10-12).**

- The 30-day free import allowance: **one**, not two. The import meter reserves once per import, in
  `runParse` (`lib/queue.ts`), before `parseText` is called at all; both requests happen inside that
  one import.
- CookPilot's hourly text limit (`social`, 30 an hour per visitor or account): **two**. Each call to
  `parseSocialRecipe` reserves one. A cook would have to paste fifteen such recipes in an hour to
  feel it.
- CookPilot's global daily ceiling for logged-out traffic (20,000): two.
- Model calls: at most one extra, and only if the paste without its link still is not read strongly.

**Needed from CookPilot.** A way to say "do not follow links" for pasted text, or never following
them for `platform: "other"`.

**RecipePrinter change.** Send the flag from `readPastedText` and delete the second call in
`parseText`. Keep the check on `parser.source`, so an answer that came from a page is still never
stored as the cook's own writing.

RecipePrinter now depends on the value `"social-outbound-link"`. If CookPilot renames it, tell us.

## 5. Fraction glyphs

`normalizeFractions` (`lib/parser.ts`) rewrites "½" to "1/2" before a paste is sent. It was added on
2026-08-28 because the parser then discarded lines that opened with a glyph. The line-joining bug in
it is fixed. It can only be removed once the **deployed** parser is confirmed to read glyphs: the
working tree on 2026-10-12 read all eighteen, with and without headings, and "1½" and "2 ¾".

Removing it changes what prints: amounts stay as the cook typed them ("½ cup", not "1/2 cup").
`lib/paprikaImport.ts` also uses it, on text RecipePrinter parses itself; that use is separate.

## 6. Limits, clocks and decoding

Nothing here was changed except decoding. The numbers disagree as follows.

| | RecipePrinter | CookPilot |
|---|---|---|
| Page size, own fetch | 2,000,000 bytes, then refused as too large | 3,000,000 bytes, then cut off and parsed |
| Page size, supplied HTML | sends at most 2,000,000 bytes | accepts 3,000,000 characters (its comment says this matches ours; it does not) |
| URL parse | waits 55 s (`COOKPILOT_TIMEOUT_MS`) | function limit 50 s, own deadline 47 s |
| Supplied HTML | waits 20 s | function limit 60 s |
| Whole import | route 85 s; the client gives up at 75 s | |
| Decoding | UTF-8, else Latin-1 (now the same) | UTF-8, else Latin-1 |

Questions for the contract:

- Is 3 MB with silent truncation staying? If so, raise `MAX_HTML_BYTES` to match; if CookPilot moves
  to refusing, keep ours and match its number.
- Is 50 s the URL function's limit for good? Then `COOKPILOT_TIMEOUT_MS` can drop to just above it,
  which gives the legs after it more of the 85.
- The client stops at 75 s and the route at 85, so the route's last ten seconds can produce an
  answer nobody is waiting for. Either number can move; decide once the leg budgets are settled.
- If CookPilot starts honouring a declared charset (header or `<meta>`), mirror it in `decodeHtml`
  in the route, so a page reads the same whichever of us fetched it.

## 7. Ingredient parts

`parseIngredientString("3 cloves")` returns amount `3`, unit `cloves`, name `3 cloves`. The adapter
now prints that as "3 cloves" and stores the name as "cloves". If CookPilot changes what it returns
for a line with nothing after its measure, the adapter's handling still holds: it only acts when the
name repeats the quantity.
