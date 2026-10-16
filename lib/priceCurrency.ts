import { labelUsdPrice } from "@/lib/usdPriceLabel";

/**
 * Which currency a visitor is quoted and charged in, and what each product
 * costs in it.
 *
 * RevenueCat Web Billing holds one hand-entered price per currency on each
 * product; nothing converts automatically. This table is the same set of
 * numbers, kept here for one reason: a signed-out visitor has to see a price,
 * and asking RevenueCat for it would configure the SDK and mint a customer
 * record for someone who only opened the site (see `getPurchases`). Anyone
 * RevenueCat already knows gets the real prices from it instead
 * (`loadRecipePrinterPrices`), so this table is only ever the first guess.
 *
 * One decision drives both ends. The currency chosen here from the country
 * cookie is the one shown on every paywall AND the one handed to
 * `getOfferings({ currency })` at checkout, so RevenueCat's own geolocation
 * never gets to pick a different one than the page displayed.
 *
 * EVERY NUMBER BELOW MUST MATCH THE REVENUECAT DASHBOARD. A price there cannot
 * be edited once saved, so the dashboard is the side that wins: if the two
 * ever differ, change this file.
 */
export type PriceCurrency =
  | "USD" | "CAD" | "GBP" | "EUR" | "AUD" | "NZD" | "CNY"
  | "JPY" | "HKD" | "SGD" | "PLN" | "CHF" | "BRL";

export type PricedProduct = "pro_monthly" | "pro_annual" | "cookbook" | "cookbook_pro_first";

/**
 * Prices in hundredths of the currency's main unit, in whatever `currency`
 * says. Hundredths for every currency, including the yen, which has no minor
 * unit: 850 yen is 85000 here, the same scale RevenueCat's micros reduce to.
 */
export interface PriceSheet {
  /** ISO 4217. A string, not `PriceCurrency`, because a sheet read from
      RevenueCat reports whatever RevenueCat actually charged in. */
  currency: string;
  amounts: Record<PricedProduct, number>;
}

/**
 * Whether visitors are quoted and charged in their own currency. Off, it is
 * dollars for everyone, on the page and at checkout alike (`offeringFor`
 * always names the currency, so the two cannot disagree either way).
 */
export function localCurrenciesLive(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_CURRENCIES === "on";
}

// Main units, laid out as the RevenueCat dashboard shows them so the two can
// be checked against each other line by line:
//                      monthly, annual, cookbook, Pro's first cookbook
const DASHBOARD_PRICES: Record<PriceCurrency, [number, number, number, number]> = {
  USD: [4.99, 39.99, 19.99, 15.99],
  CAD: [7.49, 59.99, 29.99, 23.99],
  GBP: [3.99, 31.99, 14.99, 11.99],
  EUR: [4.49, 35.99, 17.49, 13.99],
  AUD: [7.49, 59.99, 29.99, 23.99],
  NZD: [9.49, 74.99, 36.99, 29.49],
  CNY: [34.99, 279.99, 139.99, 111.99],
  JPY: [850, 6600, 3300, 2640],
  HKD: [39.99, 329.99, 164.99, 131.99],
  SGD: [6.69, 53.99, 26.99, 21.59],
  PLN: [20.49, 164.99, 81.99, 65.59],
  CHF: [4.39, 34.99, 17.49, 13.99],
  BRL: [25.99, 209.99, 104.99, 83.99],
};

function amountsFor(currency: PriceCurrency): Record<PricedProduct, number> {
  const [monthly, annual, cookbook, cookbookProFirst] = DASHBOARD_PRICES[currency].map((price) =>
    Math.round(price * 100),
  );
  return {
    pro_monthly: monthly,
    pro_annual: annual,
    cookbook,
    cookbook_pro_first: cookbookProFirst,
  };
}

const USD_AMOUNTS = amountsFor("USD");

const COUNTRY_CURRENCIES: Record<string, PriceCurrency> = {
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  CN: "CNY",
  JP: "JPY",
  HK: "HKD",
  SG: "SGD",
  PL: "PLN",
  CH: "CHF",
  BR: "BRL",
};

const EURO_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

/** Everywhere without a configured currency pays in dollars, as before. */
export function currencyForCountry(country: string | null): PriceCurrency {
  if (!localCurrenciesLive() || !country) return "USD";
  if (EURO_COUNTRIES.has(country)) return "EUR";
  return COUNTRY_CURRENCIES[country] ?? "USD";
}

export function priceSheetFor(currency: PriceCurrency): PriceSheet {
  return { currency, amounts: amountsFor(currency) };
}

/**
 * One price, written the same way wherever it appears. A fixed locale rather
 * than the browser's, so the server render and every visitor agree and a
 * Canadian dollar is never mistaken for a US one: "CA$7.49", "£3.99", "¥850".
 * Dollars keep the existing rule: "$" at home, "US$" abroad.
 */
export function formatPrice(amount: number, currency: string, country: string | null): string {
  if (currency === "USD") return labelUsdPrice(`$${(amount / 100).toFixed(2)}`, country);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

const USD_PRICE_PRODUCTS = new Map(
  (Object.entries(USD_AMOUNTS) as [PricedProduct, number][]).map(([product, amount]) => [
    `$${(amount / 100).toFixed(2)}`,
    product,
  ]),
);

// Our four dollar prices as they are typed in copy, not followed by another
// digit. A "US" in front is matched rather than looked behind for: lookbehind
// is a SyntaxError in Safari before 16.4, and this runs at module load, so it
// took down every page that imported this file (lib/browserSupport.test.ts).
const USD_PRICE_PATTERN = new RegExp(
  `(US)?(${Array.from(USD_PRICE_PRODUCTS.keys()).map((price) => price.replace(/[$.]/g, "\\$&")).join("|")})(?!\\d)`,
  "g",
);

/**
 * Rewrite our dollar prices inside a piece of copy to the visitor's price:
 * "$4.99/mo" becomes "CA$7.49/mo", and a sentence naming two prices has both
 * swapped. Everything in the app and on the SEO pages is authored in dollars,
 * and analytics keeps recording the dollar strings, so this is the one place a
 * price changes on its way to the screen.
 *
 * It matches by amount, so it cannot tell our "$4.99" from a competitor's.
 * Never pass it a competitor's column, and where one sentence names both,
 * write theirs with a word joiner ("$⁠4.99") so it is left alone.
 */
export function localizePriceText(text: string, sheet: PriceSheet, country: string | null): string {
  return text.replace(USD_PRICE_PATTERN, (match, usLabel: string | undefined, usdPrice: string) => {
    // Already labelled "US$": the visitor is being shown dollars on purpose.
    if (usLabel) return match;
    const product = USD_PRICE_PRODUCTS.get(usdPrice);
    return product ? formatPrice(sheet.amounts[product], sheet.currency, country) : usdPrice;
  });
}
