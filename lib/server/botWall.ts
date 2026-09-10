/**
 * Telling a bot wall apart from every other reason a page won't read.
 *
 * Two things were wrong before this existed. A Cloudflare interstitial that
 * answers 200 sailed through the content-type gate, produced no JSON-LD, and
 * was reported to the cook and to PostHog as "no recipe on that page" — so the
 * `blocked` number undercounted by an unknown amount and the `no_recipe`
 * number, the one we tune the parser against, was quietly contaminated. And a
 * non-2xx body was never read at all, so a 403 from a WAF and a 403 from a
 * paywall were the same event.
 *
 * The verdict is what decides whether we spend anything trying again, so the
 * expensive mistake here is a FALSE POSITIVE: paying a scraping API to re-fetch
 * a 404. The evaluation order below is built around that. Hard negatives run
 * first and win outright, an explicitly inert list keeps the ubiquitous
 * Cloudflare headers from ever counting as evidence, and the generic
 * last-resort rule is marked `weak` so it can never reach a paid rung.
 *
 * Pure on purpose: primitives in, verdict out, no `fetch` and no `Response`.
 * That is what makes it testable, since vitest only picks up `lib/**` and the
 * route itself is out of reach.
 */

import type { BotWallVendor } from "@/types/recipe";

export type WallConfidence = "strong" | "weak";

export type PageVerdict =
  | {
      kind: "bot_wall";
      vendor: BotWallVendor;
      /** Which rule fired, verbatim in the log line, so a rule that starts
          misfiring is identifiable from one Vercel log and removable in one edit. */
      signal: string;
      confidence: WallConfidence;
      /** True when the wall is a JS challenge, so a paid fetch has to render.
          False for an IP/WAF block, where rendering only costs more. */
      needsJs: boolean;
    }
  | { kind: "paywall"; signal: string }
  | { kind: "not_found" }
  | { kind: "server_error" }
  | { kind: "none" };

export interface PageSample {
  status: number;
  headers: Headers;
  /** Decoded first `BODY_PREFIX_BYTES` of the body, or "" if none was read. */
  bodyPrefix: string;
}

/**
 * Enough to fingerprint, and no more.
 *
 * Every marker below is either a header — which costs nothing — or sits in the
 * `<head>` of a challenge page that is itself well under this. Reading more
 * would only mean pulling more bytes from the response shape most likely to be
 * hostile.
 */
export const BODY_PREFIX_BYTES = 16_000;

/**
 * Headers that are NOT evidence, listed by name so nobody adds one back.
 *
 * `cf-ray` and `server: cloudflare` sit on a large fraction of the web,
 * including on every perfectly readable recipe blog behind Cloudflare's free
 * plan and on their 404 pages. `_abck` is set by Akamai Bot Manager on ordinary
 * page views, not just on blocks. Treating any of these as a signal would
 * classify half the food internet as a wall.
 *
 * Kept as a real constant with a test rather than as a comment, because the
 * mistake it prevents is the obvious one.
 */
export const INERT_MARKERS = [
  "cf-ray",
  "server: cloudflare",
  "cf-cache-status",
  "x-akamai-transformed",
  "_abck",
  "x-served-by",
] as const;

/**
 * A page telling the reader to pay or sign in.
 *
 * Runs before every wall rule, including the generic one, so a soft paywall
 * served at 403 can never be mistaken for bot protection. A proxy could often
 * get past a metered paywall; that it could is not a reason to.
 */
const PAYWALL_TEXT =
  /subscribe to (continue|read)|subscriber[- ]only|this (article|story) is for subscribers|sign in to (continue|keep) reading|create a (free )?account to (continue|keep reading)|you(?:'|&#39;|’)?ve reached your (free )?(article )?limit|metered[- ]paywall/;

/** The "you are not a person" boilerplate, for the generic non-2xx rule only. */
const GENERIC_WALL_TEXT =
  /access denied|forbidden|unusual traffic|are you a robot|verify you are (a )?human|automated (requests|traffic)|security check|enable javascript and cookies/;

/**
 * A body big enough to be a real page is a real page.
 *
 * Challenge and block interstitials are small — Cloudflare's is around 10 KB,
 * Imperva's under 2 KB. A 50 KB document at 403 is a site serving content it
 * happens to mark as forbidden, and re-fetching it will not change that.
 */
const TINY_BODY_CHARS = 2_000;

interface NormalizedSample {
  status: number;
  /** Lowercased header value, or "" when absent. */
  header: (name: string) => string;
  has: (name: string) => boolean;
  /** True if any header name starts with this prefix (for `x-px-*`). */
  hasPrefix: (prefix: string) => boolean;
  /** Every set-cookie joined and lowercased. */
  cookies: string;
  /** Lowercased body prefix. */
  body: string;
}

interface WallRule {
  vendor: BotWallVendor;
  signal: string;
  needsJs: boolean;
  test: (s: NormalizedSample) => boolean;
}

/**
 * The strong signals: each one names a specific product, and any single match
 * is enough at any status, 200 included.
 *
 * `needsJs` is a property of the fingerprint rather than something we discover
 * by trying. If we have identified a Turnstile challenge, a non-rendering paid
 * fetch returns that same challenge and burns a credit for nothing; if we have
 * identified an IP block, rendering costs five to twenty-five times more and
 * changes nothing.
 */
const WALL_RULES: readonly WallRule[] = [
  // ---- Cloudflare ------------------------------------------------------
  // Presence, not value. `challenge` is the value seen in the wild, but the
  // header exists precisely to say "this response is a mitigation" and betting
  // on its vocabulary staying put is a worse bet than betting on the header.
  {
    vendor: "cloudflare",
    signal: "cf-mitigated",
    needsJs: true,
    test: (s) => s.has("cf-mitigated"),
  },
  {
    vendor: "cloudflare",
    signal: "cdn-cgi/challenge-platform",
    needsJs: true,
    test: (s) => s.body.includes("/cdn-cgi/challenge-platform"),
  },
  {
    vendor: "cloudflare",
    signal: "_cf_chl_opt",
    needsJs: true,
    test: (s) => s.body.includes("window._cf_chl_opt") || s.body.includes("__cf$cv$params"),
  },
  {
    vendor: "cloudflare",
    signal: "turnstile",
    needsJs: true,
    test: (s) => s.body.includes("challenges.cloudflare.com/turnstile"),
  },
  {
    vendor: "cloudflare",
    signal: "just-a-moment",
    needsJs: true,
    test: (s) => s.body.includes("<title>just a moment"),
  },
  // A firewall rule, not a challenge: the 1010/1012/1015/1020 family and the
  // "Attention Required" page are Cloudflare refusing outright. No amount of
  // JS execution helps, but a different egress IP often does — so these are a
  // wall worth a rescue and NOT worth paying to render.
  {
    vendor: "cloudflare",
    signal: "attention-required",
    needsJs: false,
    test: (s) => s.body.includes("attention required! | cloudflare"),
  },
  {
    vendor: "cloudflare",
    signal: "cf-error-code",
    needsJs: false,
    test: (s) => /error code: 10(10|12|15|20)/.test(s.body),
  },

  // ---- Vercel BotID ----------------------------------------------------
  // Found on a live 429 while checking this module against real sites: a
  // "Vercel Security Checkpoint" page with `x-vercel-mitigated: challenge`.
  // Worth naming rather than leaving to the generic rule, because a growing
  // share of food sites are hosted on Vercel and `generic` is capped at `weak`
  // — it would never be allowed to spend anything on getting past this.
  {
    vendor: "vercel",
    signal: "x-vercel-mitigated",
    needsJs: true,
    test: (s) => s.has("x-vercel-mitigated") || s.has("x-vercel-challenge-token"),
  },
  {
    vendor: "vercel",
    signal: "vercel-security-checkpoint",
    needsJs: true,
    test: (s) => s.body.includes("vercel security checkpoint"),
  },

  // ---- DataDome --------------------------------------------------------
  {
    vendor: "datadome",
    signal: "x-datadome",
    needsJs: true,
    test: (s) => s.has("x-datadome") || s.has("x-datadome-cid"),
  },
  {
    vendor: "datadome",
    signal: "datadome-cookie",
    needsJs: true,
    test: (s) => s.cookies.includes("datadome="),
  },
  {
    vendor: "datadome",
    signal: "captcha-delivery",
    needsJs: true,
    test: (s) => s.body.includes("captcha-delivery.com") || s.body.includes("dd_cookie_test"),
  },

  // ---- PerimeterX / HUMAN ---------------------------------------------
  {
    vendor: "perimeterx",
    signal: "x-px-header",
    needsJs: true,
    test: (s) => s.hasPrefix("x-px"),
  },
  {
    vendor: "perimeterx",
    signal: "px-cookie",
    needsJs: true,
    test: (s) =>
      s.cookies.includes("_px3=") || s.cookies.includes("_pxhd=") || s.cookies.includes("_pxvid="),
  },
  {
    vendor: "perimeterx",
    signal: "px-script",
    needsJs: true,
    test: (s) =>
      s.body.includes("window._pxappid") ||
      s.body.includes("client.perimeterx.net") ||
      s.body.includes("px-captcha"),
  },

  // ---- Akamai ----------------------------------------------------------
  // Compound on purpose. `AkamaiGHost` alone fronts plenty of readable pages,
  // so it only counts alongside the Access Denied body Akamai actually serves
  // on a block.
  {
    vendor: "akamai",
    signal: "akamai-access-denied",
    needsJs: false,
    test: (s) =>
      s.header("server").includes("akamaighost") &&
      s.body.includes("access denied") &&
      s.body.includes("reference #"),
  },
  {
    vendor: "akamai",
    signal: "edgesuite-error",
    needsJs: false,
    test: (s) => s.body.includes("errors.edgesuite.net"),
  },
  {
    vendor: "akamai",
    signal: "akamai-request-id-403",
    needsJs: false,
    test: (s) => s.status === 403 && s.has("x-akamai-request-id"),
  },

  // ---- Imperva / Incapsula --------------------------------------------
  {
    vendor: "imperva",
    signal: "x-iinfo",
    needsJs: false,
    test: (s) => s.has("x-iinfo") || s.header("x-cdn").includes("incapsula"),
  },
  {
    vendor: "imperva",
    signal: "incap-cookie",
    needsJs: false,
    test: (s) => s.cookies.includes("visid_incap_") || s.cookies.includes("incap_ses_"),
  },
  {
    vendor: "imperva",
    signal: "incapsula-incident",
    needsJs: false,
    test: (s) =>
      s.body.includes("incapsula incident id") || s.body.includes("_incapsula_resource"),
  },

  // ---- Sucuri ----------------------------------------------------------
  {
    vendor: "sucuri",
    signal: "x-sucuri-id-403",
    needsJs: false,
    test: (s) => s.status === 403 && s.has("x-sucuri-id"),
  },
  {
    vendor: "sucuri",
    signal: "sucuri-firewall",
    needsJs: false,
    test: (s) => s.body.includes("sucuri website firewall"),
  },
];

function normalize(sample: PageSample): NormalizedSample {
  const names: string[] = [];
  sample.headers.forEach((_value, name) => names.push(name.toLowerCase()));

  // `getSetCookie` keeps multiple cookies apart; `get` folds them into one
  // string. Either is fine for a substring test, so take whichever exists.
  const withGetSetCookie = sample.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withGetSetCookie.getSetCookie
    ? withGetSetCookie.getSetCookie().join("; ")
    : (sample.headers.get("set-cookie") ?? "");

  return {
    status: sample.status,
    header: (name) => (sample.headers.get(name) ?? "").toLowerCase(),
    has: (name) => sample.headers.has(name),
    hasPrefix: (prefix) => names.some((name) => name.startsWith(prefix)),
    cookies: cookies.toLowerCase(),
    body: sample.bodyPrefix.toLowerCase(),
  };
}

/** A page carrying real recipe structured data is a real page, whatever else
    it contains. Guards against a stray `cdn-cgi` reference on a working site. */
function hasRecipeStructuredData(body: string): boolean {
  return body.includes("application/ld+json") && body.includes("recipe");
}

function firstWall(s: NormalizedSample): PageVerdict | null {
  for (const rule of WALL_RULES) {
    if (rule.test(s)) {
      return {
        kind: "bot_wall",
        vendor: rule.vendor,
        signal: rule.signal,
        confidence: "strong",
        needsJs: rule.needsJs,
      };
    }
  }
  return null;
}

export function classifyPage(sample: PageSample): PageVerdict {
  const s = normalize(sample);

  // 1. Hard negatives, before anything else. A 404 from a Cloudflare-fronted
  //    blog carries `server: cloudflare` and `cf-ray` and is still a 404, and
  //    that is the misclassification that would cost real money.
  if (s.status === 404 || s.status === 410) return { kind: "not_found" };
  if (s.status === 401) return { kind: "paywall", signal: "http-401" };
  if (s.status === 402) return { kind: "paywall", signal: "http-402" };
  if (PAYWALL_TEXT.test(s.body)) return { kind: "paywall", signal: "paywall-text" };

  // 2. A 5xx is the site being broken, not the site refusing us — unless a
  //    vendor actually named itself. Bare 503 in particular is both the old
  //    Cloudflare JS-challenge status and the single most common way an
  //    overloaded WordPress host answers, so it needs the fingerprint.
  if (s.status >= 500) return firstWall(s) ?? { kind: "server_error" };

  // 3. Strong vendor fingerprints, at any status including 200. The 200 case
  //    is the whole reason this module exists: an interstitial that answers OK
  //    used to be counted as "no recipe on that page".
  if (sample.status === 200 && hasRecipeStructuredData(s.body)) return { kind: "none" };
  const wall = firstWall(s);
  if (wall) return wall;

  // 4. Generic, and deliberately `weak`. A 403 with no vendor marker really
  //    might be a wall, and rungs A and B are free enough to try — but this
  //    rule is exactly the one that could be wrong, so it never reaches a paid
  //    rung. Never applies at 200: a hand-rolled recipe blog with no JSON-LD is
  //    a 200 full of prose with no marker on it, and it must classify `none`.
  if (s.status === 403 || s.status === 429) {
    const looksLikeContent =
      s.body.includes("application/ld+json") || s.body.includes("<article");
    const small = s.body.length < TINY_BODY_CHARS;
    if (!looksLikeContent && (small || GENERIC_WALL_TEXT.test(s.body))) {
      return {
        kind: "bot_wall",
        vendor: "generic",
        signal: small ? "bare-403-429" : "generic-wall-text",
        confidence: "weak",
        needsJs: false,
      };
    }
  }

  return { kind: "none" };
}
