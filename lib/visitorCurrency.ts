"use client";

import { useSyncExternalStore } from "react";
import {
  currencyForCountry,
  formatPrice,
  localizePriceText,
  priceSheetFor,
  type PriceCurrency,
  type PriceSheet,
} from "@/lib/priceCurrency";
import { proAnnualSavingsPercent } from "@/lib/proProduct";
import { VISITOR_COUNTRY_COOKIE } from "@/lib/usdPriceLabel";

export function readVisitorCountry(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COUNTRY_COOKIE}=([A-Z]{2})(?:;|$)`));
  return match?.[1] ?? null;
}

/** The currency this visitor is quoted in, and so the one checkout must ask
    RevenueCat for. */
export function visitorCurrency(): PriceCurrency {
  return currencyForCountry(readVisitorCountry());
}

// The cookie is set before the page loads and never changes during a visit,
// so there is nothing to subscribe to.
const subscribe = () => () => {};

// RevenueCat's own prices for this customer, once something has read them
// (see `loadRecipePrinterPrices`). Module state rather than context: the
// surfaces that show a price are scattered across unrelated trees, and the
// read happens once per visit.
let livePriceSheet: PriceSheet | null = null;
const liveListeners = new Set<() => void>();

export function setLivePriceSheet(sheet: PriceSheet): void {
  livePriceSheet = sheet;
  liveListeners.forEach((listener) => listener());
}

function subscribeLive(listener: () => void) {
  liveListeners.add(listener);
  return () => {
    liveListeners.delete(listener);
  };
}

export interface VisitorPrices {
  /** The currency those prices are in. */
  currency: string;
  /** Rewrites our dollar prices in any piece of copy to this visitor's. */
  label: (text: string) => string;
  /** A single amount in minor units, e.g. what a subscriber actually pays. */
  format: (amount: number, currency: string) => string;
  /** What annual saves over twelve monthly payments, in this currency. */
  annualSavingsPercent: number;
}

/**
 * Prices as this visitor should read them. The server render (and the first
 * client render, so hydration matches) knows no country and shows plain
 * dollars; the visitor's own currency settles in right after. RevenueCat's
 * prices replace the built-in table as soon as they are known.
 */
export function useVisitorPrices(): VisitorPrices {
  const country = useSyncExternalStore(subscribe, readVisitorCountry, () => null);
  const live = useSyncExternalStore(subscribeLive, () => livePriceSheet, () => null);
  const sheet = live ?? priceSheetFor(currencyForCountry(country));
  return {
    currency: sheet.currency,
    label: (text) => localizePriceText(text, sheet, country),
    format: (amount, currency) => formatPrice(amount, currency, country),
    annualSavingsPercent: proAnnualSavingsPercent(sheet.amounts.pro_monthly, sheet.amounts.pro_annual),
  };
}
