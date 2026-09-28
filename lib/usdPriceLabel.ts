/**
 * Prices are in US dollars for everyone: checkout (RevenueCat Web Billing) has
 * no other currency configured, so "$4.99" is the right amount worldwide. What
 * it is not is unambiguous. A visitor in Canada, Australia or New Zealand reads
 * "$" as their own dollar and meets a different number on their statement, and
 * anyone else has to guess which dollar is meant. Outside the US the symbol
 * says which: "US$4.99".
 *
 * The country is Vercel's per-request geolocation, handed to the browser in a
 * cookie by `middleware.ts`. No cookie (local dev, a preview without geo, a
 * blocked cookie) means "don't know", and not knowing keeps the plain "$" the
 * app always showed rather than guessing at someone's location.
 *
 * Display only. The fallback strings in lib/proProduct.ts and
 * lib/cookbookProduct.ts stay "$…" because analytics records them as-is and a
 * price property that varied by visitor country would split every chart.
 */
export const VISITOR_COUNTRY_COOKIE = "rp_country";

/** Where "$" already means US dollars: the US and its territories. */
const USD_HOME_COUNTRIES = new Set(["US", "PR", "GU", "VI", "AS", "MP", "UM"]);

export function labelUsdPrice(price: string, country: string | null): string {
  if (!country || USD_HOME_COUNTRIES.has(country)) return price;
  return price.replace(/^\$/, "US$");
}
