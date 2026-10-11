"use client";

import type { ReactNode } from "react";
import { useVisitorPrices } from "@/lib/visitorCurrency";

/**
 * A piece of authored copy with our prices shown in the visitor's currency.
 *
 * The SEO pages are static and written in dollars, which is what the HTML,
 * the structured data and a crawler all keep. This swaps the amounts after
 * hydration for a visitor quoted in another currency, so a page never names
 * one price and the paywall another.
 *
 * Ours only: never wrap a competitor's price (see `localizePriceText`).
 * Anything that is not plain text passes through untouched.
 */
export function PriceText({ children }: { children: ReactNode }) {
  const { label } = useVisitorPrices();
  return typeof children === "string" ? label(children) : children;
}
