/**
 * Traffic attribution: where a visitor actually came from.
 *
 * PostHog's built-in `$referring_domain` / `utm_*` capture leaves most of our
 * traffic bucketed as `$direct`, and lumps "typed the URL", "clicked a link an
 * AI assistant printed", and "followed a Pinterest pin" into shapes that are
 * awkward to chart. This module derives ONE normalized `traffic_source` string
 * from the landing URL + referrer, plus the raw first-/latest-touch fields the
 * dashboard needs.
 *
 * It is deliberately pure — no `window`, no `document`, no posthog. The caller
 * (lib/analytics.ts) reads `location.href` / `document.referrer` once at first
 * load, hands them in, and pushes the result onto the PostHog person as super
 * properties. Keeping the logic pure is what lets the whole classifier be
 * exercised in the node test env (see attribution.test.ts) instead of a
 * browser.
 *
 * To add a new source: add a row to `REFERRER_RULES` (matched against the
 * referrer hostname) and, if campaigns tag it, a row to `UTM_SOURCE_ALIASES`
 * (matched against `utm_source`). Nothing else needs to change. Add an AI
 * assistant's name to `AI_TRAFFIC_SOURCES` too so `is_ai_traffic` stays true.
 */

/**
 * The closed vocabulary of normalized sources. `traffic_source` is usually one
 * of these; the one exception is an unrecognized `utm_source`, which is
 * title-cased and passed through rather than discarded (so a new campaign tag
 * shows up as itself, not swallowed into "Referral"). Hence the open string arm.
 */
export type KnownTrafficSource =
  | "Google Search"
  | "Bing Search"
  | "DuckDuckGo"
  | "ChatGPT"
  | "Perplexity"
  | "Claude"
  | "Gemini"
  | "Microsoft Copilot"
  | "Pinterest"
  | "Reddit"
  | "Hacker News"
  | "Facebook"
  | "Instagram"
  | "X / Twitter"
  | "Threads"
  | "Bluesky"
  | "LinkedIn"
  | "TikTok"
  | "YouTube"
  | "Product Hunt"
  | "Peerlist"
  | "PeerPush"
  | "Uneed"
  | "UI Comet"
  | "Fazier"
  | "MicroLaunch"
  | "TinyLaunch"
  | "Startup Fame"
  | "BetaList"
  | "Indie Hackers"
  | "SaaSHub"
  | "AlternativeTo"
  | "Mobbin"
  | "Land-book"
  | "Godly"
  | "Email"
  | "CookPilot"
  | "Shared Card"
  | "Referral"
  | "Direct / Unknown";

export type TrafficSource = KnownTrafficSource | (string & {});

/**
 * Referrer-hostname → source. Ordered: the first match wins, so more specific
 * subdomains (an AI assistant hosted under a search engine's domain) MUST come
 * before the broader engine rule. `gemini.google.com` has to be caught before
 * the general `google.*` rule, and `copilot.microsoft.com` before Bing.
 *
 * Each pattern is anchored with `(^|\.)…$` so it matches the domain and any of
 * its subdomains (`m.facebook.com`, `l.facebook.com`) but nothing that merely
 * contains the string (`notgoogle.com` won't match `google.com`).
 */
export const REFERRER_RULES: ReadonlyArray<{
  source: KnownTrafficSource;
  pattern: RegExp;
}> = [
  // --- AI assistants (checked first; some live under a search engine domain).
  { source: "ChatGPT", pattern: /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/ },
  { source: "Perplexity", pattern: /(^|\.)perplexity\.ai$/ },
  { source: "Claude", pattern: /(^|\.)(claude\.ai|anthropic\.com)$/ },
  { source: "Gemini", pattern: /(^|\.)gemini\.google\.com$/ },
  { source: "Microsoft Copilot", pattern: /(^|\.)copilot\.microsoft\.com$/ },
  // --- Search engines. Google matches any country TLD (google.co.uk, google.de).
  { source: "Google Search", pattern: /(^|\.)google(\.[a-z]{2,3}){1,2}$/ },
  { source: "Bing Search", pattern: /(^|\.)bing\.com$/ },
  { source: "DuckDuckGo", pattern: /(^|\.)duckduckgo\.com$/ },
  // --- Social / referral networks.
  { source: "Pinterest", pattern: /(^|\.)(pinterest(\.[a-z]{2,3}){1,2}|pin\.it)$/ },
  { source: "Reddit", pattern: /(^|\.)reddit\.com$/ },
  { source: "Facebook", pattern: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/ },
  { source: "Instagram", pattern: /(^|\.)instagram\.com$/ },
  // X still serves both hostnames, and every link posted to it is rewritten to
  // a `t.co` shim — which is where the referrer comes from, so without that
  // third alternative the entire channel reads as a generic "Referral" on
  // exactly the days a launch is being amplified there.
  { source: "X / Twitter", pattern: /(^|\.)(x\.com|twitter\.com|t\.co)$/ },
  { source: "Threads", pattern: /(^|\.)threads\.(net|com)$/ },
  { source: "Bluesky", pattern: /(^|\.)bsky\.(app|social)$/ },
  { source: "LinkedIn", pattern: /(^|\.)(linkedin\.com|lnkd\.in)$/ },
  { source: "TikTok", pattern: /(^|\.)tiktok\.com$/ },
  { source: "YouTube", pattern: /(^|\.)(youtube\.com|youtu\.be)$/ },
  // Show HN is a launch channel wearing a forum's clothes: one dated spike,
  // no permanent listing. Bucketed under Launch for that reason (see
  // TrafficCategory) even though the site itself is a community.
  // Anchored on the news subdomain and the HN search mirror — a click from
  // `ycombinator.com` itself is YC, not Hacker News.
  { source: "Hacker News", pattern: /^(news\.ycombinator\.com|hn\.algolia\.com|hckrnews\.com)$/ },
  // --- Launch / discovery platforms. Both send a burst of traffic on launch
  // day and then a long tail from the permanent listing, which is exactly the
  // shape that gets lost inside a generic "Referral".
  // Peerlist launches send traffic from the post and the profile alike, and
  // its share links keep the referrer on peerlist.io.
  // Product Hunt is the big one: launch-day traffic arrives from the post, and
  // the listing keeps sending clicks for months. Its outbound links also tag
  // themselves `?ref=producthunt` and hop through `producthunt.com/r/<id>`,
  // both of which resolve to this same name (see UTM_SOURCE_ALIASES).
  { source: "Product Hunt", pattern: /(^|\.)producthunt\.com$/ },
  { source: "Peerlist", pattern: /(^|\.)peerlist\.io$/ },
  { source: "PeerPush", pattern: /(^|\.)peerpush\.net$/ },
  { source: "Uneed", pattern: /(^|\.)uneed\.best$/ },
  { source: "Fazier", pattern: /(^|\.)fazier\.com$/ },
  { source: "MicroLaunch", pattern: /(^|\.)microlaunch\.net$/ },
  { source: "TinyLaunch", pattern: /(^|\.)tinylaun\.ch$/ },
  { source: "Startup Fame", pattern: /(^|\.)startupfame\.com$/ },
  { source: "BetaList", pattern: /(^|\.)betalist\.com$/ },
  { source: "Indie Hackers", pattern: /(^|\.)indiehackers\.com$/ },
  // Directories rather than launch-day feeds: no spike, but a listing that
  // ranks and sends a steady trickle. Same bucket, because the question they
  // answer is the same one ("did submitting us anywhere do anything").
  { source: "SaaSHub", pattern: /(^|\.)saashub\.com$/ },
  { source: "AlternativeTo", pattern: /(^|\.)alternativeto\.net$/ },
  // Design galleries. Mobbin indexes real product screens (it moved from
  // mobbin.design to mobbin.com and both still resolve), Land-book and Godly
  // index marketing pages. Their traffic is designers browsing, which is a
  // different visitor than a launch feed sends, so each keeps its own name.
  { source: "Mobbin", pattern: /(^|\.)mobbin\.(com|design)$/ },
  { source: "Land-book", pattern: /(^|\.)land-book\.com$/ },
  { source: "Godly", pattern: /(^|\.)godly\.website$/ },
  // UI Comet's launch feed lives on `launches.uicomet.com`; the studio's own
  // site is the apex, and either can send a click.
  { source: "UI Comet", pattern: /(^|\.)uicomet\.com$/ },
  // --- Android in-app browsers. Tapping a link inside an app hands us
  // `android-app://<package>` as the referrer, so the "hostname" is a package
  // name and none of the domain rules above can ever match it. Without these
  // rows Instagram, Facebook and Gmail traffic all landed in the generic
  // "Referral" bucket — present in the numbers, but anonymous inside it.
  { source: "Instagram", pattern: /^com\.instagram\.android$/ },
  { source: "Facebook", pattern: /^com\.facebook\.(katana|orca|lite)$/ },
  { source: "Pinterest", pattern: /^com\.pinterest$/ },
  { source: "Reddit", pattern: /^com\.reddit\.frontpage$/ },
  { source: "ChatGPT", pattern: /^com\.openai\.chatgpt$/ },
  { source: "X / Twitter", pattern: /^com\.twitter\.android$/ },
  { source: "LinkedIn", pattern: /^com\.linkedin\.android$/ },
  { source: "TikTok", pattern: /^com\.zhiliaoapp\.musically$/ },
  { source: "YouTube", pattern: /^com\.google\.android\.youtube$/ },
  // Threads ships under its codename, `barcelona`.
  { source: "Threads", pattern: /^com\.instagram\.barcelona$/ },
  // The Gmail app is the one email client that announces itself. Gmail on the
  // WEB cannot be told apart from search — see `classifyTrafficSource`.
  { source: "Email", pattern: /^com\.google\.android\.gm$/ },
  { source: "Google Search", pattern: /^com\.google\.android\.googlequicksearchbox$/ },

  // --- Our sister product; a link from CookPilot is a known, valuable path.
  { source: "CookPilot", pattern: /(^|\.)cookpilotapp\.com$/ },
];

/**
 * `utm_source` value → source. UTMs are author-controlled and messy
 * (`google`, `google-ads`, `adwords` all mean Google), so each row lists the
 * spellings we've seen. A row matches when the lowercased `utm_source` equals a
 * keyword or contains it as a token.
 */
export const UTM_SOURCE_ALIASES: ReadonlyArray<{
  source: KnownTrafficSource;
  keywords: readonly string[];
}> = [
  { source: "Google Search", keywords: ["google", "googleads", "google-ads", "adwords", "gads"] },
  { source: "Bing Search", keywords: ["bing", "msn"] },
  { source: "DuckDuckGo", keywords: ["duckduckgo", "ddg"] },
  { source: "ChatGPT", keywords: ["chatgpt", "openai"] },
  { source: "Perplexity", keywords: ["perplexity"] },
  { source: "Claude", keywords: ["claude", "anthropic"] },
  { source: "Gemini", keywords: ["gemini", "bard"] },
  { source: "Microsoft Copilot", keywords: ["copilot"] },
  { source: "Pinterest", keywords: ["pinterest"] },
  { source: "Reddit", keywords: ["reddit"] },
  { source: "Facebook", keywords: ["facebook", "fb", "meta"] },
  { source: "Instagram", keywords: ["instagram", "ig"] },
  // No bare "x" or "yt": these keywords are also matched as substrings, and a
  // one- or two-letter token would swallow half the campaign tags we ever set.
  { source: "X / Twitter", keywords: ["twitter", "x.com", "t.co"] },
  { source: "Threads", keywords: ["threads"] },
  { source: "Bluesky", keywords: ["bluesky", "bsky"] },
  { source: "LinkedIn", keywords: ["linkedin"] },
  { source: "TikTok", keywords: ["tiktok"] },
  { source: "YouTube", keywords: ["youtube"] },
  { source: "Hacker News", keywords: ["hackernews", "hacker-news", "hacker_news", "ycombinator"] },
  // Product Hunt tags its own outbound links `?ref=producthunt`, which lands
  // here rather than in the referrer rules.
  { source: "Product Hunt", keywords: ["producthunt", "product-hunt", "product_hunt"] },
  { source: "Peerlist", keywords: ["peerlist"] },
  { source: "PeerPush", keywords: ["peerpush"] },
  { source: "Uneed", keywords: ["uneed"] },
  { source: "UI Comet", keywords: ["uicomet", "ui-comet"] },
  { source: "Fazier", keywords: ["fazier"] },
  { source: "MicroLaunch", keywords: ["microlaunch", "micro-launch"] },
  { source: "TinyLaunch", keywords: ["tinylaunch", "tiny-launch", "tinylaun"] },
  { source: "Startup Fame", keywords: ["startupfame", "startup-fame"] },
  { source: "BetaList", keywords: ["betalist", "beta-list"] },
  { source: "Indie Hackers", keywords: ["indiehackers", "indie-hackers"] },
  { source: "SaaSHub", keywords: ["saashub"] },
  { source: "AlternativeTo", keywords: ["alternativeto", "alternative-to"] },
  { source: "Mobbin", keywords: ["mobbin"] },
  { source: "Land-book", keywords: ["land-book", "landbook"] },
  { source: "Godly", keywords: ["godly"] },
  { source: "Email", keywords: ["email", "e-mail", "newsletter", "klaviyo", "mailchimp", "substack"] },
  { source: "CookPilot", keywords: ["cookpilot"] },
  // Our own share links (see components/AdminShareLinkDialog).
  { source: "Shared Card", keywords: ["shared_card", "shared-card"] },
];

/**
 * Sources that are AI assistants. Surfaced as its own boolean super property
 * (`is_ai_traffic`) so "how much traffic is AI referring us?" is a single
 * filter rather than an OR across five source names.
 */
export const AI_TRAFFIC_SOURCES: ReadonlySet<TrafficSource> = new Set<TrafficSource>([
  "ChatGPT",
  "Perplexity",
  "Claude",
  "Gemini",
  "Microsoft Copilot",
]);

export function isAiTraffic(source: TrafficSource): boolean {
  return AI_TRAFFIC_SOURCES.has(source);
}

/** The single value that means "no external source" — kept as a const so the
 *  classifier and the "don't overwrite latest with Direct" guard can't drift. */
export const DIRECT_TRAFFIC_SOURCE = "Direct / Unknown";

/** True when a source represents a real external referral (anything but Direct). */
export function isExternalSource(source: TrafficSource): boolean {
  return source !== DIRECT_TRAFFIC_SOURCE;
}

/**
 * The coarse bucket a source rolls up into, for high-level "how much of our
 * traffic is AI vs Search vs Social" reporting alongside the specific source.
 * An unrecognized (custom `utm_source`) value is a tagged campaign we don't
 * have a bucket for → Referral.
 *
 * `Launch` is its own bucket rather than a flavour of Social/Referral: a launch
 * platform's traffic is one dated spike plus a listing tail, so mixing it into
 * Social would distort the organic-social trend line on exactly the days we
 * most want to read it, and burying it in Referral would make "how did the
 * launches do" an ever-growing OR across site names.
 */
export type TrafficCategory =
  | "AI"
  | "Search"
  | "Social"
  | "Launch"
  | "Email"
  | "Referral"
  | "Direct";

const CATEGORY_BY_SOURCE: Readonly<Record<KnownTrafficSource, TrafficCategory>> = {
  "Google Search": "Search",
  "Bing Search": "Search",
  DuckDuckGo: "Search",
  ChatGPT: "AI",
  Perplexity: "AI",
  Claude: "AI",
  Gemini: "AI",
  "Microsoft Copilot": "AI",
  Pinterest: "Social",
  Reddit: "Social",
  Facebook: "Social",
  Instagram: "Social",
  "X / Twitter": "Social",
  Threads: "Social",
  Bluesky: "Social",
  LinkedIn: "Social",
  TikTok: "Social",
  YouTube: "Social",
  // Hacker News sits in Launch, not Social: a Show HN is one dated spike, the
  // exact shape that would distort the organic-social trend line.
  "Hacker News": "Launch",
  "Product Hunt": "Launch",
  Peerlist: "Launch",
  PeerPush: "Launch",
  Uneed: "Launch",
  "UI Comet": "Launch",
  Fazier: "Launch",
  MicroLaunch: "Launch",
  TinyLaunch: "Launch",
  "Startup Fame": "Launch",
  BetaList: "Launch",
  "Indie Hackers": "Launch",
  SaaSHub: "Launch",
  AlternativeTo: "Launch",
  Mobbin: "Launch",
  "Land-book": "Launch",
  Godly: "Launch",
  Email: "Email",
  CookPilot: "Referral",
  "Shared Card": "Referral",
  Referral: "Referral",
  "Direct / Unknown": "Direct",
};

export function categoryOf(source: TrafficSource): TrafficCategory {
  return CATEGORY_BY_SOURCE[source as KnownTrafficSource] ?? "Referral";
}

/** The landing signals we read once at first load. */
export interface AttributionInput {
  /** `window.location.href` of the landing page. */
  href: string;
  /** `document.referrer` — "" when the visit was direct. */
  referrer: string;
}

/** The resolved attribution, ready to register on the PostHog person. */
export interface Attribution {
  source: TrafficSource;
  /** Full referrer URL as the browser reported it ("" when direct). */
  referrer: string;
  /** Landing path + query (origin omitted — we're a single domain). */
  landingPage: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  /** The raw `?ref=`/`via=`/`source=` tag, kept as sent so an unrecognized one
      is still readable on the event rather than only in its resolved form. */
  refParam: string | null;
}

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Title-case a raw utm_source we don't have a bucket for: `spring_sale` → `Spring Sale`. */
function titleCase(raw: string): string {
  return raw
    .replace(/[-_+]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function isEmailMedium(medium: string | null): boolean {
  if (!medium) return false;
  const m = medium.toLowerCase();
  return m === "email" || m === "e-mail" || m === "newsletter";
}

/** A source name we recognize, or null. Strict: no title-casing fallback, so a
    caller that must not invent sources (see `normalizeRefParam`) can say no. */
export function matchUtmAlias(value: string): KnownTrafficSource | null {
  const src = value.toLowerCase().trim();
  for (const { source, keywords } of UTM_SOURCE_ALIASES) {
    if (keywords.some((k) => src === k || src.includes(k))) return source;
  }
  return null;
}

/** Map a `utm_source` onto a normalized source, or title-case it if unknown. */
export function normalizeUtmSource(
  utmSource: string,
  utmMedium: string | null,
): TrafficSource {
  const matched = matchUtmAlias(utmSource);
  if (matched) return matched;
  if (isEmailMedium(utmMedium)) return "Email";
  // Unknown but tagged: keep the campaign's own name rather than hiding it.
  return titleCase(utmSource);
}

/**
 * A hostname pulled out of a loose value, or null if it isn't one.
 *
 * `?ref=` carries whatever its author felt like: a bare host
 * (`launches.uicomet.com`), a full URL, or a word (`newsletter`). A dot is what
 * separates the first two from the third — without that check `?ref=newsletter`
 * parses as a hostname called "newsletter" and gets matched against domain
 * rules it can never satisfy.
 */
function hostFromLooseValue(value: string): string | null {
  const candidate = value.includes("://") ? value : `https://${value}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/**
 * `?ref=` → a source, or null to keep looking.
 *
 * Plenty of launch directories and indie listings tag outbound links with
 * `ref` rather than `utm_source` — `?ref=launches.uicomet.com` is a real visit
 * we filed as Direct, on a link that named its own source in the URL.
 *
 * Resolved to the SAME name a real referrer would have produced, so a UI Comet
 * click is "UI Comet" whether it arrived tagged or with a referrer intact and
 * the two don't split one source into two rows.
 *
 * Deliberately below `utm_source` in the ladder: `ref` is an ad-hoc convention
 * that also gets used for affiliate and referral codes, so a campaign that
 * bothered with a real UTM outranks it.
 */
export function normalizeRefParam(raw: string, utmMedium: string | null): TrafficSource | null {
  const value = raw.trim();
  if (!value) return null;
  const host = hostFromLooseValue(value);
  if (host) return matchReferrer(host) ?? "Referral";
  // Not a host. Recognize it or decline — never title-case, because `ref` is
  // also where affiliate and referral CODES live, and inventing a source per
  // code would bury the real names under a tail of one-visit rows. The raw tag
  // still rides on the event as `refParam`, so an unrecognized one is readable
  // and can earn a rule later.
  return matchUtmAlias(value) ?? (isEmailMedium(utmMedium) ? "Email" : null);
}

/** Match a referrer hostname against the ordered rule list. */
export function matchReferrer(host: string): KnownTrafficSource | null {
  const h = host.toLowerCase();
  for (const { source, pattern } of REFERRER_RULES) {
    if (pattern.test(h)) return source;
  }
  return null;
}

/**
 * The precedence ladder, in one place:
 *   1. An explicit `utm_source` — the campaign told us, so believe it.
 *   2. An email `utm_medium` with no source — still clearly email.
 *   3. A paid click id — `gclid` is Google, `fbclid` is Facebook.
 *   4. A `?ref=` style tag — the link named its own source (see
 *      `normalizeRefParam`). Below the UTMs because it is a convention rather
 *      than a standard, and above the referrer because a link that says where
 *      it came from beats guessing from a hostname that may not survive the hop.
 *   5. The referrer hostname, matched against REFERRER_RULES; an unmatched
 *      external referrer is a generic "Referral".
 *   6. Nothing to go on → "Direct / Unknown".
 * A self-referral (someone already on our domain) counts as no referrer.
 *
 * One thing this ladder deliberately does NOT try: telling Gmail on the web
 * apart from Google Search. Gmail sends its clicks through
 * `google.com/url?q=…`, and by the time the browser reports a referrer it is
 * the bare `google.com` origin, identical to a search click. A path-sniffing
 * rule would fire almost never and would mislabel real search traffic as email
 * when it did. The Gmail APP is catchable (it names its own package) and
 * anything we send ourselves should carry a UTM; web Gmail stays in Search,
 * and that is the honest answer rather than a guess dressed up as one.
 */
export function classifyTrafficSource(p: {
  utmSource: string | null;
  utmMedium: string | null;
  gclid: string | null;
  fbclid: string | null;
  refParam: string | null;
  referrerHost: string | null;
  isSelfReferral: boolean;
}): TrafficSource {
  if (p.utmSource) return normalizeUtmSource(p.utmSource, p.utmMedium);
  if (isEmailMedium(p.utmMedium)) return "Email";
  if (p.gclid) return "Google Search";
  if (p.fbclid) return "Facebook";
  if (p.refParam) {
    const tagged = normalizeRefParam(p.refParam, p.utmMedium);
    if (tagged) return tagged;
  }
  if (p.referrerHost && !p.isSelfReferral) {
    return matchReferrer(p.referrerHost) ?? "Referral";
  }
  return DIRECT_TRAFFIC_SOURCE;
}

/** A query param, trimmed, or null when absent/blank. */
function param(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Derive the full attribution from the landing URL and referrer. Pure. */
export function resolveAttribution(input: AttributionInput): Attribution {
  let landingPage = "/";
  let params = new URLSearchParams();
  let currentHost = "";
  try {
    const url = new URL(input.href);
    landingPage = `${url.pathname}${url.search}`;
    params = url.searchParams;
    currentHost = stripWww(url.hostname);
  } catch {
    // Malformed href (shouldn't happen from a real browser) — fall back to
    // Direct with an empty landing rather than throwing during boot.
  }

  const referrer = input.referrer || "";
  let referrerHost: string | null = null;
  let isSelfReferral = false;
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      referrerHost = host.toLowerCase();
      isSelfReferral = stripWww(host) === currentHost;
    } catch {
      // Non-URL referrer — ignore it.
    }
  }

  const utmSource = param(params, "utm_source");
  const utmMedium = param(params, "utm_medium");
  const utmCampaign = param(params, "utm_campaign");
  const gclid = param(params, "gclid");
  const fbclid = param(params, "fbclid");
  // Three spellings of the same idea. First one present wins; `utm_source`
  // still outranks all of them in the ladder below.
  const refParam =
    param(params, "ref") ?? param(params, "via") ?? param(params, "source");

  const source = classifyTrafficSource({
    utmSource,
    utmMedium,
    gclid,
    fbclid,
    refParam,
    referrerHost,
    isSelfReferral,
  });

  return {
    source,
    referrer,
    landingPage,
    utmSource,
    utmMedium,
    utmCampaign,
    gclid,
    fbclid,
    refParam,
  };
}
