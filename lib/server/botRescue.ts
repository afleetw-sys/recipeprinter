/**
 * One more try at a page that is refusing us, and only at a page that is
 * actually refusing us.
 *
 * The gate is `classifyPage`, not the HTTP status: this runs on a `bot_wall`
 * verdict and on nothing else, so a 404, a paywall, an overloaded host and a
 * page that simply has no recipe on it all cost exactly what they cost today.
 *
 * What rung A can and cannot do, plainly, because it is easy to expect too
 * much of it. Our ordinary request sends a bare `accept: text/html` with
 * `cache-control: no-cache` and no `sec-fetch-*` set at all, which is a shape
 * no real browser navigation produces — a WAF rule that checks request shape
 * catches it every time, and that kind of rule is a large share of the
 * food-blog long tail. Sending what Chrome actually sends defeats those.
 *
 * It does not defeat, and will not: TLS fingerprinting (undici's ClientHello
 * is not Chrome's, and no header changes that), HTTP/2 fingerprinting (we
 * negotiate 1.1, Chrome speaks h2), header ORDER, datacenter-IP reputation, or
 * any challenge that wants JavaScript run. Those need a different egress or a
 * real browser, which is what the later rungs are for.
 *
 * The page fetch is injected rather than done here, so the SSRF blocklist, the
 * redirect cap and the byte cap are the same ones the ordinary path uses
 * instead of a second copy that drifts.
 */

import type { RescueOutcome, RescueRung } from "@/types/recipe";
import { isPlaceholderHost } from "@/lib/friendlyErrors";
import { BODY_PREFIX_BYTES, classifyPage, type PageVerdict } from "@/lib/server/botWall";

export type BotWallVerdict = Extract<PageVerdict, { kind: "bot_wall" }>;

export interface RescueContext {
  url: URL;
  /**
   * Deliberately the whole `PageVerdict` union rather than the narrowed
   * bot-wall member. The type could enforce this at the call site, but the
   * invariant being protected is "never spend on a 404", and a runtime guard
   * on the value that decides it is worth more than a compile-time one that a
   * future `as` would erase.
   */
  verdict: PageVerdict;
  /** `callerKey(request)`, for the per-caller cap the paid rung will need. */
  caller: string;
  /** `Date.now()` by which this whole invocation has to be finished. */
  deadlineAt: number;
}

export interface RescueDeps {
  /** The route's own guarded fetcher: SSRF blocklist per redirect hop, manual
      redirects, capped at the same byte budget. */
  fetchPage: (url: URL, headers: Record<string, string>, timeoutMs: number) => Promise<Response>;
  /** The route's own body reader, so the byte cap is shared too. */
  readHtml: (response: Response) => Promise<string>;
}

export type RescueReport =
  | { outcome: RescueRung; html: string; finalUrl: string }
  /** Every permitted rung ran and failed. Nothing left to try. */
  | { outcome: "none" }
  /**
   * We declined to start: out of time, or no rung was permitted. Distinct from
   * `none` on purpose, and the distinction is load-bearing — only `none` may
   * suppress the client's fallback to the callable, because only `none` means
   * we actually exhausted the options.
   */
  | { outcome: "skipped_budget" };

/**
 * Below this there is no point starting. A rung that gets aborted mid-flight
 * costs the wait without the chance, and the platform kills the function at
 * `maxDuration` regardless of what we were in the middle of.
 */
const MIN_RESCUE_MS = 8_000;

/** Rung A's own ceiling, further clipped by whatever time is actually left. */
const RUNG_A_TIMEOUT_MS = 12_000;

/**
 * What Chrome 126 on macOS actually sends on a top-level navigation.
 *
 * Note what is absent as much as what is present: no `cache-control` and no
 * `pragma`. A real navigation sends neither, and our ordinary request sends
 * both, which is a free tell.
 *
 * `referer` is the site's own origin rather than a search engine. It is the
 * plausible referer for a deep link into an article, and it does not assert a
 * Google search that never happened.
 */
export function browserHeaders(url: URL): Record<string, string> {
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    // Brotli is deliberately absent: if undici does not transparently
    // decompress it on the Node version this runs on, adding it returns binary
    // that would read as "no recipe on that page" rather than as an error.
    "accept-encoding": "gzip, deflate",
    referer: `${url.origin}/`,
    "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
}

function isHtml(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("text/html") || contentType.includes("application/xhtml");
}

/**
 * Rung A. Resolves to the page's HTML, or null if it came back as a wall
 * again, as something that isn't HTML, or not at all.
 *
 * Never throws: a rescue that blows up has to leave the original failure
 * intact, not replace it with a worse one.
 */
async function rungHeaders(ctx: RescueContext, deps: RescueDeps): Promise<{ html: string; finalUrl: string } | null> {
  const remaining = ctx.deadlineAt - Date.now();
  const timeoutMs = Math.min(RUNG_A_TIMEOUT_MS, remaining - 1_000);
  if (timeoutMs <= 0) return null;

  try {
    const response = await deps.fetchPage(ctx.url, browserHeaders(ctx.url), timeoutMs);
    if (!response.ok || !isHtml(response)) return null;

    const html = await deps.readHtml(response);
    // The wall may simply have answered again, this time at 200. Classifying
    // our own retry is what stops an interstitial being handed to the JSON-LD
    // reader and reported as "no recipe on that page" a second time.
    const verdict = classifyPage({
      status: response.status,
      headers: response.headers,
      bodyPrefix: html.slice(0, BODY_PREFIX_BYTES),
    });
    if (verdict.kind === "bot_wall") return null;

    return { html, finalUrl: response.url || ctx.url.toString() };
  } catch {
    return null;
  }
}

/**
 * Walk the ladder, cheapest rung first, at most one ladder per import.
 *
 * Rungs B (a reader proxy) and C (a paid scraping API) slot in after this one
 * and are not built yet. When they are, rung C additionally requires
 * `confidence === "strong"`: the generic 403 rule is exactly the one that
 * could be wrong about a page, so it is never the one that spends money.
 */
export async function rescueBotWall(ctx: RescueContext, deps: RescueDeps): Promise<RescueReport> {
  if (ctx.verdict.kind !== "bot_wall") return { outcome: "skipped_budget" };
  // A reserved address (example.com, anything under .test) has nothing behind
  // it to fetch harder at. It should never reach a wall verdict in the first
  // place, and this is the check that costs nothing to keep anyway.
  if (isPlaceholderHost(ctx.url.hostname)) return { outcome: "skipped_budget" };
  if (ctx.deadlineAt - Date.now() < MIN_RESCUE_MS) return { outcome: "skipped_budget" };

  const headersRung = await rungHeaders(ctx, deps);
  if (headersRung) return { outcome: "a_headers", ...headersRung };

  return { outcome: "none" };
}

/** True when the ladder genuinely ran out of options, as opposed to never
    getting to start. Only this may suppress the client's own fallback. */
export function rescueExhausted(outcome: RescueOutcome): boolean {
  return outcome === "none";
}
