import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  currencyForCountry,
  formatPrice,
  localizePriceText,
  priceSheetFor,
  type PriceCurrency,
} from "./priceCurrency";
import { proAnnualSavingsPercent } from "./proProduct";

// The prices saved on the four products in RevenueCat, as the dashboard shows
// them: monthly, annual, cookbook, Pro's first cookbook. Typed out a second
// time on purpose. They cannot be edited there once saved, so a change to the
// table in priceCurrency.ts that this does not also get is a paywall quoting
// a price checkout will not charge.
const SAVED_IN_REVENUECAT: Record<PriceCurrency, [number, number, number, number]> = {
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
const CURRENCIES = Object.keys(SAVED_IN_REVENUECAT) as PriceCurrency[];

describe("with local currencies on", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_LOCAL_CURRENCIES", "on");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("every currency carries the prices saved in RevenueCat", () => {
    for (const currency of CURRENCIES) {
      const { amounts } = priceSheetFor(currency);
      expect(
        [amounts.pro_monthly, amounts.pro_annual, amounts.cookbook, amounts.cookbook_pro_first],
        currency,
      ).toEqual(SAVED_IN_REVENUECAT[currency].map((price) => Math.round(price * 100)));
    }
  });

  test("a country is quoted in its own currency, and anywhere else in dollars", () => {
    const expected: Record<string, PriceCurrency> = {
      US: "USD", CA: "CAD", GB: "GBP", DE: "EUR", FR: "EUR", IE: "EUR", AU: "AUD",
      NZ: "NZD", CN: "CNY", JP: "JPY", HK: "HKD", SG: "SGD", PL: "PLN", CH: "CHF",
      BR: "BRL",
      // No price is configured for these, so they stay on dollars.
      MX: "USD", IN: "USD", SE: "USD", ZA: "USD",
    };
    for (const [country, currency] of Object.entries(expected)) {
      expect(currencyForCountry(country), country).toBe(currency);
    }
    expect(currencyForCountry(null)).toBe("USD");
    // Every configured currency is reachable from somewhere.
    expect(new Set(Object.values(expected))).toEqual(new Set(CURRENCIES));
  });

  test("the cookbook discount is never quoted above the full price", () => {
    for (const currency of CURRENCIES) {
      const { amounts } = priceSheetFor(currency);
      expect(amounts.cookbook_pro_first, currency).toBeLessThan(amounts.cookbook);
    }
  });

  test("the annual saving is worked out from that currency's own prices", () => {
    for (const currency of CURRENCIES) {
      const { amounts } = priceSheetFor(currency);
      const percent = proAnnualSavingsPercent(amounts.pro_monthly, amounts.pro_annual);
      const exact = (1 - amounts.pro_annual / (amounts.pro_monthly * 12)) * 100;
      expect(Number.isInteger(percent), currency).toBe(true);
      // Rounded down, so the claim is never more than the prices give.
      expect(percent, currency).toBeLessThanOrEqual(exact);
      expect(percent, currency).toBeGreaterThan(exact - 1);
    }
  });
});

test("with local currencies off, every country is quoted in dollars", () => {
  for (const country of ["CA", "GB", "DE", "JP", "BR", "US"]) {
    expect(currencyForCountry(country), country).toBe("USD");
  }
});

describe("formatPrice", () => {
  test("keeps cents where the currency has them and drops them where it does not", () => {
    expect(formatPrice(749, "CAD", "CA")).toMatch(/7\.49$/);
    expect(formatPrice(85000, "JPY", "JP")).toMatch(/850$/);
    expect(formatPrice(660000, "JPY", "JP")).toMatch(/6,600$/);
  });

  test("no two currencies that share a symbol can be read as each other", () => {
    const dollars = ["USD", "CAD", "AUD", "NZD", "HKD", "SGD"].map((currency) =>
      formatPrice(1000, currency, "GB").replace(/[\d.,\s]/g, ""),
    );
    expect(new Set(dollars).size).toBe(dollars.length);
    expect(formatPrice(1000, "JPY", "JP").replace(/[\d.,\s]/g, "")).not.toBe(
      formatPrice(1000, "CNY", "CN").replace(/[\d.,\s]/g, ""),
    );
  });

  test("dollars keep the plain sign at home and are named abroad", () => {
    expect(formatPrice(499, "USD", "US")).toBe("$4.99");
    expect(formatPrice(499, "USD", null)).toBe("$4.99");
    expect(formatPrice(499, "USD", "MX")).toBe("US$4.99");
  });
});

describe("localizePriceText", () => {
  const cad = priceSheetFor("CAD");
  const priced = (amount: number) => formatPrice(amount, "CAD", "CA");

  test("swaps every one of our prices in a sentence, and nothing else", () => {
    const text = "Pro is $4.99 a month or $39.99 a year. A cookbook is $19.99, or $15.99 with Pro. Books start at $18.";
    expect(localizePriceText(text, cad, "CA")).toBe(
      `Pro is ${priced(749)} a month or ${priced(5999)} a year. A cookbook is ${priced(2999)}, or ${priced(2399)} with Pro. Books start at $18.`,
    );
  });

  test("leaves a competitor's price that is marked as theirs", () => {
    const theirs = "$⁠4.99 monthly subscription";
    expect(localizePriceText(`Theirs: ${theirs}. Ours: $4.99/mo.`, cad, "CA")).toBe(
      `Theirs: ${theirs}. Ours: ${priced(749)}/mo.`,
    );
  });

  test("a dollar visitor at home sees the copy exactly as written", () => {
    const text = "RecipePrinter Pro ($4.99/mo), cookbooks $19.99.";
    expect(localizePriceText(text, priceSheetFor("USD"), "US")).toBe(text);
  });

  test("shows RevenueCat's own numbers when they are what the sheet holds", () => {
    const live = { currency: "GBP", amounts: { ...priceSheetFor("GBP").amounts, pro_monthly: 425 } };
    expect(localizePriceText("$4.99/mo", live, "GB")).toBe(`${formatPrice(425, "GBP", "GB")}/mo`);
  });
});
