/**
 * What kind of link is this, before we spend a parse on it.
 *
 * Two link shapes reach the import box that are not recipe pages, and they
 * pull in opposite directions:
 *
 *   A SEARCH RESULTS page (`google.com/search?q=oatmeal+scotchie+bars`) has no
 *   recipe on it at all, only links to some. Handing it to the parser costs the
 *   full budget — CookPilot's 55s, then our own fetch — to arrive at an answer
 *   we could have given instantly, and the answer it gives ("we couldn't find a
 *   complete recipe on that page") reads as our failure rather than as the one
 *   thing the cook needs to hear, which is: open the recipe and paste that.
 *
 *   A REDIRECT link (`google.com/url?q=https://sallysbaking.com/…`) is the
 *   opposite: it is a recipe page, wearing a wrapper. Search engines, mail
 *   clients and link trackers all hand these out, and the destination is
 *   sitting right there in a query parameter. Unwrapping is a save, not a
 *   rejection.
 *
 * They share a host and differ only by path, which is exactly why this is one
 * module: `google.com/search` and `google.com/url` must never be confused, so
 * the code that tells them apart should be readable side by side.
 *
 * Nothing here fetches anything. Every decision is made from the URL's own
 * shape, so it costs nothing and runs identically on the client (before the
 * queue starts a parse) and on the server (in front of the paid parser).
 */

import { normalizeImportURL } from "@/lib/cookpilot";

/**
 * One line for every reason a site refuses us: a bot wall, a 403, a login gate
 * we cannot pass. A cook cannot tell those apart and cannot act on the
 * difference, so they all get the same sentence.
 *
 * It says why, and then what to do about it, in that order. The version before
 * this one led with the remedy and dropped the cause entirely, on the grounds
 * that a bot check is not something anyone can act on. True, and beside the
 * point: someone whose import just failed wants to know it was not their link
 * and not their fault before they will try anything else. Without the first
 * half, "paste the text instead" reads as a shrug.
 *
 * What it does not do is name the mechanism. "Protected by a bot check" and
 * "HTTP 403" describe our problem, not theirs. "Blocks anything automated from
 * reading it" is the same fact in words a cook already owns.
 *
 * "To go around it" is the part that earns the second attempt: it says the next
 * route does not run into the same wall, so trying again is not just hope.
 *
 * Lives here because the API route and the client parser both raise it, and two
 * copies of one sentence drift.
 */
export const BLOCKED_REMEDY =
  "This site blocks anything automated from reading it. Paste the recipe text or upload a screenshot to go around it.";


/**
 * The panel copy, for a search engine's results and for a site's own search
 * alike. They were two messages for a while and ended up differing by the one
 * word "results", which is not a distinction worth a second string: a site's
 * `/search?q=` page is a results page too.
 *
 * "Looks like" is doing real work. Naming the page is fine; an earlier draft
 * went on to explain that a results page has no recipe on it, which tells the
 * reader something they already know, and a sentence that explains the obvious
 * back to someone reads as a correction. They didn't misunderstand anything.
 *
 * "Copy the link from the recipe you want" rather than "open the recipe": both
 * routes to that link are fine (click through and copy the address bar, or
 * copy the link straight off the results), and there is no reason for us to
 * pick one.
 */
export const SEARCH_PAGE_MESSAGE =
  "That looks like a search results page. Copy the link from the recipe you want and paste it here.";

/** The toast has room for about five words; see `shortImportError`. */
export const SEARCH_PAGE_SHORT_MESSAGE = "That's a search results page";

/** Lowercased, trimmed, `www.` dropped, so every check below compares like with like. */
function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Search engines, matched as patterns rather than a flat list because the big
 * ones are a family of country domains: `google.com`, `google.co.uk` and
 * `google.de` are one engine, and a cook in any of them pastes the same shape
 * of link. `{1,2}` covers both `google.de` and `google.co.uk`.
 */
const SEARCH_ENGINE_HOSTS: RegExp[] = [
  /^google(\.[a-z]{2,3}){1,2}$/,
  /^(lite\.|html\.)?duckduckgo\.com$/,
  /^duck\.com$/,
  /^bing\.com$/,
  /^(.+\.)?search\.yahoo\.com$/,
  /^search\.brave\.com$/,
  /^ecosia\.org$/,
  /^startpage\.com$/,
  /^yandex(\.[a-z]{2,3}){1,2}$/,
  /^baidu\.com$/,
  /^qwant\.com$/,
  /^mojeek\.com$/,
  /^ask\.com$/,
  /^search\.aol\.com$/,
  /^searx\..+$/,
];

/**
 * The parameter each engine types the phrase into. Yahoo uses `p`, Yandex
 * `text`, Baidu `wd`; the rest are variations on `q`. We never read the value
 * (what someone is cooking is not ours to keep) — only whether one is present,
 * which is what separates a results page from the engine's homepage.
 */
const ENGINE_QUERY_PARAMS = ["q", "query", "p", "text", "wd", "k"];

/**
 * A site's own search box. `s` is here because it is WordPress's default, and
 * WordPress is most of the recipe blogs on the web: `sallysbaking.com/?s=cookies`
 * is a listing page even though nothing in the path says so.
 */
const SITE_SEARCH_PARAMS = ["q", "query", "s", "search", "keyword", "keywords"];

/**
 * Path segments that mean "this URL is a doorway to another one". A redirector
 * is identified by its PATH, never by its parameters alone: `q` holds a typed
 * phrase on `/search` and a destination URL on `/url`, so a parameter-only rule
 * would unwrap the very pages this module exists to turn away.
 */
const REDIRECT_PATH_SEGMENTS = new Set(["url", "redirect", "redir", "out", "away", "link", "l"]);

/** Where a redirector parks the destination. */
const REDIRECT_PARAMS = ["q", "u", "url", "uddg", "to", "target", "dest", "destination"];

/** Path segments, lowercased, with empties dropped so a trailing slash changes nothing. */
function segmentsOf(url: URL): string[] {
  return url.pathname.toLowerCase().split("/").filter(Boolean);
}

function hasNonEmptyParam(url: URL, keys: string[]): boolean {
  return keys.some((key) => (url.searchParams.get(key) ?? "").trim() !== "");
}

/** The destination a redirect link points at, or null if this isn't one. */
function redirectTarget(url: URL): string | null {
  const segments = segmentsOf(url);
  const last = segments[segments.length - 1] ?? "";
  if (!REDIRECT_PATH_SEGMENTS.has(last)) return null;

  for (const key of REDIRECT_PARAMS) {
    const value = (url.searchParams.get(key) ?? "").trim();
    if (!value) continue;
    try {
      // `searchParams.get` has already percent-decoded, so this is the real
      // destination. Parsing it is also the guard: a parameter has to hold an
      // absolute http(s) URL to be followed, which is what keeps `javascript:`
      // and relative junk out.
      const target = new URL(value);
      if (target.protocol === "http:" || target.protocol === "https:") return target.toString();
    } catch {
      /* Not a URL in this parameter; try the next one. */
    }
  }
  return null;
}

/** True for a link whose only job is to forward to another one. */
export function isRedirectLink(rawUrl: string): boolean {
  try {
    return redirectTarget(new URL(normalizeImportURL(rawUrl))) !== null;
  } catch {
    return false;
  }
}

/**
 * Follows a redirect wrapper to the page the cook actually meant, or returns
 * the URL unchanged. Idempotent, so every entry point can call it without
 * caring whether an earlier one already did.
 *
 * The loop is for the wrapper-in-a-wrapper case (a search result copied out of
 * a newsletter arrives double-wrapped often enough to be worth three hops) and
 * is bounded so a redirector pointing at itself can't spin here.
 */
export function unwrapRedirectUrl(rawUrl: string): string {
  let current = normalizeImportURL(rawUrl);

  for (let hop = 0; hop < 3; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return current;
    }
    const target = redirectTarget(parsed);
    if (!target || target === current) return current;
    current = target;
  }

  return current;
}

/**
 * The reply for a page that lists recipes rather than holding one, or null for
 * a link worth parsing.
 *
 * The copy says only what to do next. An earlier draft opened by explaining
 * that a results page has no recipe on it, which tells the reader something
 * they already know — they were just on that page — and a sentence that
 * explains the obvious back to someone reads as a correction. They didn't
 * misunderstand anything; they pasted what was in the address bar.
 *
 * Deliberately NOT triggered by a roundup page ("25 best cookie recipes"),
 * which really does hold several recipes and which we import in full via
 * `multiRecipe` — see `runParse` in lib/queue.ts. That case is a success, and
 * this message must never appear next to it.
 */
export function searchPageMessage(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(normalizeImportURL(rawUrl));
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A wrapper around a real recipe page is the opposite of this, and it can
  // sit on a search engine's own host. Checked first, so `/url` never falls
  // through to the engine rule below on its way to being unwrapped.
  if (redirectTarget(url)) return null;

  const host = normalizeHost(url.hostname);
  const segments = segmentsOf(url);

  if (SEARCH_ENGINE_HOSTS.some((pattern) => pattern.test(host))) {
    // An engine's bare homepage is not a results page. It is a strange thing to
    // paste either way, but it has no answer of ours to give, so it goes to the
    // parser like anything else rather than getting copy that doesn't fit.
    if (segments.includes("search") || hasNonEmptyParam(url, ENGINE_QUERY_PARAMS)) {
      return SEARCH_PAGE_MESSAGE;
    }
    return null;
  }

  // A site's own listing: `/search?q=…`, and the WordPress `/?s=…` at the root.
  // A path segment literally named `search` is enough on its own — Blogger's
  // `/search/label/cookies` carries no query parameter and is still a list.
  if (segments.includes("search")) return SEARCH_PAGE_MESSAGE;
  if (segments.length === 0 && hasNonEmptyParam(url, SITE_SEARCH_PARAMS)) return SEARCH_PAGE_MESSAGE;

  return null;
}
