import { SITE_URL } from "@/lib/seo";
import { localStore } from "@/lib/storage";

/**
 * The ad platforms' tags, used only to measure which ads lead to cookbook
 * purchases:
 *   - Google Ads: the Google tag, container GTM-T9LW4QJF, sending to
 *     AW-18072225757.
 *   - Reddit Ads: the Reddit Pixel, a2_jzjg6tsb2g6q.
 *
 * Both sit inside the same opt-outs as PostHog (see `initAnalytics`), checked
 * once for both, so no browser that has opted out of one is still measured by
 * another:
 *   - Only on the real domain. Localhost and preview deploys never load them,
 *     except with `?adtags` (or the older `?gtm`) on a non-production host to
 *     check the install, and then with nothing personalised or stored.
 *   - Never on `/export` (the PDF renderer's headless Chrome) or
 *     `/print-check` (our own diagnostics).
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
 * provider under the CCPA.
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

type AdTagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  rdt?: RedditPixel;
};

interface AdTagConfig {
  containerId: string;
  redditPixelId: string;
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
    productionHosts: productionHosts(),
    blockedCountries: CONSENT_REQUIRED_COUNTRIES,
    postHogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  };
  return `(${bootAdTags.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});`;
}

const COOKBOOK_PURCHASE_CONVERSION = "AW-18072225757/n0FuCLyxmLQdEN2PwalD";
const REPORTED_PURCHASES_KEY = "rp_reported_purchases";

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
 * A paid cookbook, for Google Ads and Reddit Ads. Called once, after checkout
 * resolves as paid: never on a click, a cancel, a failure or a page load, and
 * never for Pro. The tags exist only when they loaded, so every opt-out and
 * region rule above applies here too.
 *
 * Each transaction is reported once per browser. Google also dedupes on
 * `transaction_id`, but Reddit dedupes only between its pixel and its server
 * API, never two pixel events, so the guard here is what stops a repeat.
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
  if (typeof window === "undefined") return;
  const w = window as AdTagWindow;
  if (!w.gtag && !w.rdt) return;

  const id = paid.transactionId;
  const seen = reportedPurchases();
  if (id && seen.includes(id)) return;

  const value =
    paid.amountMicros !== null && paid.currency
      ? { value: Math.round(paid.amountMicros / 10_000) / 100, currency: paid.currency }
      : {};

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

  if (id) localStore.set(REPORTED_PURCHASES_KEY, JSON.stringify([...seen, id].slice(-20)));
}
