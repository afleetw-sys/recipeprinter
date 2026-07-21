import { SITE_URL } from "@/lib/seo";

/**
 * Is this browser looking at the real, public product?
 *
 * Anything that isn't the canonical domain — localhost, a LAN IP on a phone,
 * a `*.vercel.app` preview — is us testing, and must not reach analytics or
 * mint RevenueCat customer records. Checking the hostname rather than
 * NODE_ENV is the whole point: Vercel builds preview deploys in production
 * mode, so a NODE_ENV check alone would happily report every preview click
 * as real user behaviour.
 *
 * Derived from SITE_URL so there's one place to change the domain, and
 * accepts both apex and www since either can serve the site.
 */
const PRODUCTION_HOSTS: ReadonlySet<string> = (() => {
  try {
    const apex = new URL(SITE_URL).hostname.replace(/^www\./, "");
    return new Set([apex, `www.${apex}`]);
  } catch {
    return new Set(["recipeprinter.com", "www.recipeprinter.com"]);
  }
})();

/**
 * Server-side this returns false. Both callers (analytics, RevenueCat customer
 * identity) are browser-only concerns, and "assume test" is the safe default
 * for anything that would otherwise pollute production data.
 */
export function isProductionRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return PRODUCTION_HOSTS.has(window.location.hostname);
}
