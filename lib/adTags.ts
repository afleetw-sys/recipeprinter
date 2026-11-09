import { SITE_URL } from "@/lib/seo";
import { localStore } from "@/lib/storage";

/**
 * The ad platforms' tags, used only to measure which ads lead to cookbook
 * purchases:
 *   - Google Ads: the Google tag, container GTM-T9LW4QJF, sending to
 *     AW-18072225757.
 *   - Reddit Ads: the Reddit Pixel, a2_jzjg6tsb2g6q.
 *   - Meta Ads: the Meta Pixel, 1140865415111079. Its Purchase is also sent
 *     from the server (CookPilot's RevenueCat webhook, through the Conversions
 *     API), and only for a browser that passed every check below: see
 *     `metaCheckoutAttributes`.
 *
 * All three sit inside the same opt-outs as PostHog (see `initAnalytics`), checked
 * once for both, so no browser that has opted out of one is still measured by
 * another:
 *   - Only on the real domain. Localhost and preview deploys never load them,
 *     except with `?adtags` (or the older `?gtm`) on a non-production host to
 *     check the install, and then with nothing personalised or stored.
 *   - Never on `/export` (the PDF renderer's headless Chrome) or
 *     `/print-check` (our own diagnostics).
 *   - Never on a page opened from a print hand-off link (lib/printHandoff.ts),
 *     whose `#rp=` fragment IS the cook's recipes: the tags report the page's
 *     address, fragment included, and recipes never go to an ad platform.
 *   - Never for a browser that opted out with `?optout`, read from the same
 *     flag PostHog saves, or one sending Global Privacy Control.
 *   - Never in the EEA, UK or Switzerland, where there's no consent banner to
 *     ask. Not "consent denied": Google still sends cookieless requests then,
 *     so nothing is loaded at all. A visitor whose country we don't know (the
 *     `rp_country` cookie from middleware.ts) is treated the same way.
 *
 * Neither may use the data to target anyone: the privacy policy says we don't
 * share data for cross-context behavioural advertising. Google gets ad
 * personalisation denied plus restricted data processing; Reddit gets Limited
 * Data Use with the visitor's country and state, which makes Reddit a service
 * provider under the CCPA. Meta gets Limited Data Use too (Meta works out the
 * state itself), and its automatic configuration is off, so it never reads
 * buttons or page metadata: it gets the events we name and nothing else.
 *
 * It runs as an inline script in every page's <head> (app/layout.tsx), not
 * from React after the page loads. Google Ads checks a site for its tag by
 * reading the page, and a tag added later by script looked like no tag at all
 * ("set up Google tag on your website"). The checks above all run inline,
 * before anything loads.
 *
 * No `<noscript>` iframe or image: it would load before any of these checks
 * can run.
 */
export const GTM_CONTAINER_ID = "GTM-T9LW4QJF";
export const REDDIT_PIXEL_ID = "a2_jzjg6tsb2g6q";
export const META_PIXEL_ID = "1140865415111079";

// EEA (EU + Iceland, Liechtenstein, Norway), UK and Switzerland.
const CONSENT_REQUIRED_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
];

type RedditPixel = ((...args: unknown[]) => void) & {
  callQueue?: unknown[];
  sendEvent?: (...args: unknown[]) => void;
};

type MetaPixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: MetaPixel;
  loaded?: boolean;
  version?: string;
  /** Read by fbevents.js: no PageView of its own on history.pushState. */
  disablePushState?: boolean;
};

type AdTagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  rdt?: RedditPixel;
  fbq?: MetaPixel;
  _fbq?: MetaPixel;
  /** True when the Meta Pixel loaded on the real domain and is measuring; false
      for an install check from a dev host, where it is loaded but revoked. */
  rpMetaMeasuring?: boolean;
};

interface AdTagConfig {
  containerId: string;
  redditPixelId: string;
  metaPixelId: string;
  productionHosts: string[];
  blockedCountries: string[];
  /** PostHog's project key, which names the localStorage entry its opt-out lives in. */
  postHogKey: string;
}

/**
 * The whole loader, run inline in <head> as `(bootAdTags)(config)`. It must
 * stand alone: it is turned into text, so it can't reach anything outside
 * itself, and it sticks to syntax every browser we support parses.
 */
function bootAdTags(config: AdTagConfig): void {
  var w = window as AdTagWindow;
  var loc = window.location;
  var params = new URLSearchParams(loc.search);
  var flag = function (key: string): boolean | null {
    if (!params.has(key)) return null;
    var raw = params.get(key);
    return raw === null || raw === "" || raw === "1" || raw === "true";
  };
  var production = config.productionHosts.indexOf(loc.hostname) !== -1;
  if (!production && flag("adtags") !== true && flag("gtm") !== true) return;
  if (loc.pathname.indexOf("/export") === 0 || loc.pathname.indexOf("/print-check") === 0) return;
  if (loc.hash.indexOf("#rp=") === 0) return;

  var optOut = flag("optout");
  if (optOut === true) return;
  if (optOut !== false && config.postHogKey) {
    var stored: string | null = null;
    try {
      stored = window.localStorage.getItem("__ph_opt_in_out_" + config.postHogKey);
    } catch {
      stored = null;
    }
    if (stored === "0" || stored === "false") return;
  }
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) return;

  var cookie = function (name: string, pattern: string): string | null {
    var found = document.cookie.match(new RegExp("(?:^|; )" + name + "=(" + pattern + ")(?:;|$)"));
    return found ? found[1] : null;
  };
  // Dev hosts have no country cookie, so only a known one blocks there.
  var country = cookie("rp_country", "[A-Z]{2}");
  if (country ? config.blockedCountries.indexOf(country) !== -1 : production) return;
  var region = cookie("rp_region", "[A-Z0-9]{1,3}");

  // Google.
  w.dataLayer = w.dataLayer || [];
  // gtag() must push the real `arguments` object; Google's code checks for it.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag(
    "consent",
    "default",
    production
      ? { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "granted" }
      : // An install check from a dev host: no cookies, nothing personalised.
        { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" },
  );
  // Google acts as our service provider (CCPA), measuring our own ads only.
  w.gtag("set", "restricted_data_processing", true);
  w.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  var gtm = document.createElement("script");
  gtm.async = true;
  gtm.src = "https://www.googletagmanager.com/gtm.js?id=" + config.containerId;
  document.head.appendChild(gtm);

  // Reddit: its own base code, with Limited Data Use for everyone (Reddit as
  // our service provider, measuring our own ads only).
  if (!w.rdt) {
    var rdt: RedditPixel = function () {
      // eslint-disable-next-line prefer-rest-params
      if (rdt.sendEvent) rdt.sendEvent.apply(rdt, arguments as unknown as unknown[]);
      // eslint-disable-next-line prefer-rest-params
      else rdt.callQueue!.push(arguments);
    };
    rdt.callQueue = [];
    w.rdt = rdt;
    var init: Record<string, unknown> = { dpm: "LDU" };
    if (country) init.dpcc = country;
    if (region) init.dprc = region;
    // An install check from a dev host: marked opted out, so nothing is kept.
    if (!production) init.optOut = true;
    rdt("init", config.redditPixelId, init);
    rdt("track", "PageVisit");
    var pixel = document.createElement("script");
    pixel.async = true;
    pixel.src = "https://www.redditstatic.com/ads/pixel.js?pixel_id=" + config.redditPixelId;
    document.head.appendChild(pixel);
  }

  // Meta: its own base code, once per document. Route changes send their own
  // PageView from React (`reportMetaPageView`), so fbevents.js is told not to
  // send another on pushState.
  if (!w.fbq) {
    var fbq: MetaPixel = function () {
      // eslint-disable-next-line prefer-rest-params
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments as unknown as unknown[]);
      // eslint-disable-next-line prefer-rest-params
      else fbq.queue!.push(arguments);
    };
    if (!w._fbq) w._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    fbq.disablePushState = true;
    w.fbq = fbq;
    w.rpMetaMeasuring = production;
    // An install check from a dev host: consent revoked, so nothing is sent.
    if (!production) fbq("consent", "revoke");
    // Meta as our service provider where state law has Limited Data Use; 0, 0
    // asks Meta to apply it by the visitor's location.
    fbq("dataProcessingOptions", ["LDU"], 0, 0);
    // No automatic events, button text or page metadata: on our pages that
    // would be the cook's recipes.
    fbq("set", "autoConfig", false, config.metaPixelId);
    fbq("init", config.metaPixelId);
    fbq("track", "PageView");
    var fbevents = document.createElement("script");
    fbevents.async = true;
    fbevents.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(fbevents);
  }
}

function productionHosts(): string[] {
  try {
    var apex = new URL(SITE_URL).hostname.replace(/^www\./, "");
    return [apex, "www." + apex];
  } catch {
    return ["recipeprinter.com", "www.recipeprinter.com"];
  }
}

/** The inline <head> script (app/layout.tsx). */
export function adTagsInlineScript(): string {
  const config: AdTagConfig = {
    containerId: GTM_CONTAINER_ID,
    redditPixelId: REDDIT_PIXEL_ID,
    metaPixelId: META_PIXEL_ID,
    productionHosts: productionHosts(),
    blockedCountries: CONSENT_REQUIRED_COUNTRIES,
    postHogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  };
  return `(${bootAdTags.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});`;
}

const COOKBOOK_PURCHASE_CONVERSION = "AW-18072225757/n0FuCLyxmLQdEN2PwalD";
const REPORTED_PURCHASES_KEY = "rp_reported_purchases";
/** What Meta's content fields name: the product family, never a book or recipe. */
const META_COOKBOOK_CONTENT = { content_type: "product", content_ids: ["cookbook"], num_items: 1 };

function adTagWindow(): AdTagWindow | null {
  return typeof window === "undefined" ? null : (window as AdTagWindow);
}

/**
 * How many decimal places a currency's amounts have: 2 for dollars, 0 for yen,
 * 3 for Kuwaiti dinars. Unknown codes are taken as 2.
 */
export function currencyMinorUnits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * RevenueCat's price in micros (millionths of the currency's main unit) as the
 * number the ad platforms want, rounded to what the currency can actually
 * charge. CookPilot's Conversions API sender does the same sum; keep in step.
 */
export function purchaseValue(amountMicros: number, currency: string): number {
  const digits = currencyMinorUnits(currency);
  const scale = 10 ** digits;
  return Math.round((amountMicros / 1_000_000) * scale) / scale;
}

let lastMetaPageView: string | null = null;

/**
 * A Meta PageView for a client-side route change. The first call, made when the
 * app mounts, only records where the page loaded: the inline loader already
 * sent that PageView. After that, one per new address, so a re-render or a
 * repeated effect on the same route never sends a second.
 */
export function reportMetaPageView(path: string): void {
  if (lastMetaPageView === null) {
    lastMetaPageView = path;
    return;
  }
  if (path === lastMetaPageView) return;
  lastMetaPageView = path;
  adTagWindow()?.fbq?.("track", "PageView");
}

/** A new cookbook was built (not a stashed one restored), for Meta only. */
export function reportCookbookCreated(): void {
  adTagWindow()?.fbq?.("trackCustom", "CreateCookbook");
}

/** A cookbook checkout is opening, for Meta only. Never Pro. */
export function reportCookbookCheckoutStarted(): void {
  adTagWindow()?.fbq?.("track", "InitiateCheckout", { ...META_COOKBOOK_CONTENT });
}

function readCookie(name: string, pattern: string): string | null {
  if (typeof document === "undefined") return null;
  const found = document.cookie.match(new RegExp("(?:^|; )" + name + "=(" + pattern + ")(?:;|$)"));
  return found ? found[1] : null;
}

/**
 * RevenueCat customer attributes set just before every cookbook checkout, read
 * by CookPilot's webhook to decide whether to send Meta the server-side copy of
 * the Purchase.
 *
 * The webhook can't see this browser, so this is how the opt-outs reach it:
 * `meta_capi` is "1" only when the Meta Pixel loaded here and is measuring,
 * which means every check in `bootAdTags` passed. Otherwise every key is null,
 * which deletes it, so a consent from an earlier checkout never carries over.
 * The rest is only what Meta matches a browser by: its own `_fbp`/`_fbc`
 * cookies, the user agent, and the country/state for Limited Data Use.
 */
export function metaCheckoutAttributes(): Record<string, string | null> {
  const w = adTagWindow();
  const measuring = Boolean(w?.fbq && w.rpMetaMeasuring === true);
  const value = (v: string | null | undefined) => (measuring && v ? v.slice(0, 500) : null);
  return {
    meta_capi: measuring ? "1" : null,
    meta_fbp: value(readCookie("_fbp", "[^;]+")),
    meta_fbc: value(readCookie("_fbc", "[^;]+")),
    meta_ua: value(typeof navigator === "undefined" ? null : navigator.userAgent),
    meta_cc: value(readCookie("rp_country", "[A-Z]{2}")),
    meta_rc: value(readCookie("rp_region", "[A-Z0-9]{1,3}")),
  };
}

/** Transactions this browser has already reported, newest last. */
function reportedPurchases(): string[] {
  try {
    const list = JSON.parse(localStore.get(REPORTED_PURCHASES_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * A paid cookbook, for Google Ads, Reddit Ads and Meta. Called once, after
 * checkout resolves as paid: never on a click, a cancel, a failure or a page
 * load, and never for Pro. The tags exist only when they loaded, so every
 * opt-out and region rule above applies here too.
 *
 * Each transaction is reported once per browser. Google also dedupes on
 * `transaction_id`, but Reddit dedupes only between its pixel and its server
 * API, never two pixel events, so the guard here is what stops a repeat.
 *
 * Meta gets the same Purchase from CookPilot's webhook as well, and counts the
 * two once because both carry the store's transaction id as the event id. So
 * Meta's copy here is sent only with that id and a value: without the id the
 * two couldn't be matched, and a valueless copy arriving first would be the one
 * Meta kept. The server's copy covers both cases.
 *
 * `amountMicros` is null when the amount charged can't be known here (see
 * `PaidPurchase`); the purchase is then reported without a value rather than
 * with a guessed one.
 */
export function reportCookbookPurchase(paid: {
  transactionId: string | null;
  amountMicros: number | null;
  currency: string | null;
}): void {
  const w = adTagWindow();
  if (!w) return;
  if (!w.gtag && !w.rdt && !w.fbq) return;

  const id = paid.transactionId;
  const seen = reportedPurchases();
  if (id && seen.includes(id)) return;

  const value =
    paid.amountMicros !== null && paid.currency
      ? { value: purchaseValue(paid.amountMicros, paid.currency), currency: paid.currency }
      : null;

  if (w.gtag) {
    w.gtag("event", "conversion", {
      send_to: COOKBOOK_PURCHASE_CONVERSION,
      ...value,
      transaction_id: id ?? "",
    });
  }
  if (w.rdt) {
    w.rdt("track", "Purchase", {
      itemCount: 1,
      ...value,
      // The store's order number: what Reddit matches on if its server API is
      // added later, so the two copies of one sale count once.
      ...(id ? { conversionId: id } : {}),
    });
  }
  if (w.fbq && id && value) {
    w.fbq("track", "Purchase", { ...value, ...META_COOKBOOK_CONTENT }, { eventID: id });
  }

  if (id) localStore.set(REPORTED_PURCHASES_KEY, JSON.stringify([...seen, id].slice(-20)));
}

/** Test seam: forget the route the last Meta PageView was for. */
export function resetMetaPageViewForTest(): void {
  lastMetaPageView = null;
}
