import { SITE_URL } from "@/lib/seo";

/**
 * The Google tag for Google Ads (container GTM-T9LW4QJF, which sends to
 * AW-18072225757). Used only to measure which ads lead to purchases.
 *
 * It sits inside the same opt-outs as PostHog (see `initAnalytics`), so no
 * browser that has opted out of one is still measured by the other:
 *   - Only on the real domain. Localhost and preview deploys never load it,
 *     except with `?gtm` on a non-production host to check the install.
 *   - Never on `/export` (the PDF renderer's headless Chrome) or
 *     `/print-check` (our own diagnostics).
 *   - Never for a browser that opted out with `?optout`, read from the same
 *     flag PostHog saves, or one sending Global Privacy Control.
 *   - Never in the EEA, UK or Switzerland, where there's no consent banner to
 *     ask. Not "consent denied": Google still sends cookieless requests then,
 *     so the tag isn't loaded at all. A visitor whose country we don't know
 *     (the `rp_country` cookie from middleware.ts) is treated the same way.
 *
 * Ad personalisation (remarketing) is denied by default, because the privacy
 * policy says we don't share data for cross-context behavioural advertising.
 *
 * It runs as an inline script in every page's <head> (app/layout.tsx), not
 * from React after the page loads. Google Ads checks a site for its tag by
 * reading the page, and a tag added later by script looked like no tag at all
 * ("set up Google tag on your website"). The checks above all run inline,
 * before anything loads.
 *
 * No `<noscript>` iframe: it would load before any of these checks can run.
 */
export const GTM_CONTAINER_ID = "GTM-T9LW4QJF";

// EEA (EU + Iceland, Liechtenstein, Norway), UK and Switzerland.
const CONSENT_REQUIRED_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
];

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

interface GoogleTagConfig {
  containerId: string;
  productionHosts: string[];
  blockedCountries: string[];
  /** PostHog's project key, which names the localStorage entry its opt-out lives in. */
  postHogKey: string;
}

/**
 * The whole loader, run inline in <head> as `(bootGoogleTag)(config)`. It
 * must stand alone: it is turned into text, so it can't reach anything
 * outside itself, and it sticks to syntax every browser we support parses.
 */
function bootGoogleTag(config: GoogleTagConfig): void {
  var w = window as GtagWindow;
  var loc = window.location;
  var params = new URLSearchParams(loc.search);
  var flag = function (key: string): boolean | null {
    if (!params.has(key)) return null;
    var raw = params.get(key);
    return raw === null || raw === "" || raw === "1" || raw === "true";
  };
  var production = config.productionHosts.indexOf(loc.hostname) !== -1;
  if (!production && flag("gtm") !== true) return;
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

  // Dev hosts have no country cookie, so only a known one blocks there.
  var match = document.cookie.match(/(?:^|; )rp_country=([A-Z]{2})(?:;|$)/);
  var country = match ? match[1] : null;
  if (country ? config.blockedCountries.indexOf(country) !== -1 : production) return;

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

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtm.js?id=" + config.containerId;
  document.head.appendChild(script);
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
export function googleTagInlineScript(): string {
  const config: GoogleTagConfig = {
    containerId: GTM_CONTAINER_ID,
    productionHosts: productionHosts(),
    blockedCountries: CONSENT_REQUIRED_COUNTRIES,
    postHogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  };
  return `(${bootGoogleTag.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});`;
}

const COOKBOOK_PURCHASE_CONVERSION = "AW-18072225757/n0FuCLyxmLQdEN2PwalD";

/**
 * A paid cookbook, for Google Ads. Called once, after checkout resolves as
 * paid: never on a click, a cancel or a page load. `gtag` exists only when
 * the tag loaded, so every opt-out and region rule above applies here too.
 * The transaction id stops Google counting the same purchase twice.
 */
export function reportCookbookPurchase(paid: {
  transactionId: string | null;
  amountMicros: number;
  currency: string;
}): void {
  if (typeof window === "undefined") return;
  const gtag = (window as GtagWindow).gtag;
  if (!gtag) return;
  gtag("event", "conversion", {
    send_to: COOKBOOK_PURCHASE_CONVERSION,
    value: Math.round(paid.amountMicros / 10_000) / 100,
    currency: paid.currency,
    transaction_id: paid.transactionId ?? "",
  });
}
