"use client";

import { useSyncExternalStore } from "react";
import { labelUsdPrice, VISITOR_COUNTRY_COOKIE } from "@/lib/usdPriceLabel";

export function readVisitorCountry(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COUNTRY_COOKIE}=([A-Z]{2})(?:;|$)`));
  return match?.[1] ?? null;
}

// The cookie is set before the page loads and never changes during a visit,
// so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * A formatter for prices shown on screen. The server render (and the first
 * client render, so hydration matches) knows no country and shows "$"; the
 * label settles to "US$" right after for a visitor outside the US.
 */
export function useUsdPriceLabel(): (price: string) => string {
  const country = useSyncExternalStore(subscribe, readVisitorCountry, () => null);
  return (price) => labelUsdPrice(price, country);
}
