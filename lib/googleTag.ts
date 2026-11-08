import { sendsGlobalPrivacyControl } from "@/lib/analytics";
import { isProductionRuntime } from "@/lib/appEnvironment";
import { localStore } from "@/lib/storage";
import { readVisitorCountry } from "@/lib/visitorCurrency";

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
 * No `<noscript>` iframe: it would load before any of these checks can run.
 */
export const GTM_CONTAINER_ID = "GTM-T9LW4QJF";

// EEA (EU + Iceland, Liechtenstein, Norway), UK and Switzerland.
const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
]);

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

let started = false;

/** Reads a URL flag, treating a bare `?flag` and `?flag=1` the same. */
function urlFlag(params: URLSearchParams, key: string): boolean | null {
  if (!params.has(key)) return null;
  const raw = params.get(key);
  return raw === null || raw === "" || raw === "1" || raw === "true";
}

/** The `?optout` choice PostHog saved (`opt_out_capturing_persistence_type: "localStorage"`). */
function postHogOptedOut(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  const stored = localStore.get(`__ph_opt_in_out_${key}`);
  return stored === "0" || stored === "false";
}

export function initGoogleTag(): void {
  if (started || typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const production = isProductionRuntime();
  if (!production && urlFlag(params, "gtm") !== true) return;

  const path = window.location.pathname;
  if (path.startsWith("/export") || path.startsWith("/print-check")) return;

  const optOut = urlFlag(params, "optout");
  if (optOut === true) return;
  if (optOut !== false && postHogOptedOut()) return;
  if (sendsGlobalPrivacyControl()) return;

  // Dev hosts have no country cookie, so only a known one blocks there.
  const country = readVisitorCountry();
  if (country ? CONSENT_REQUIRED_COUNTRIES.has(country) : production) return;

  started = true;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  // gtag() must push the real `arguments` object; Google's code checks for it.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };

  if (production) {
    w.gtag("consent", "default", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
  } else {
    // An install check from a dev host: no cookies, nothing personalised.
    w.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  }

  // Google acts as our service provider (CCPA), measuring our own ads only.
  w.gtag("set", "restricted_data_processing", true);

  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
  document.head.appendChild(script);
}
