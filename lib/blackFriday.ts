import type { CustomerInfo } from "@revenuecat/purchases-js";
import { DEFAULT_PRO_CYCLE, RECIPEPRINTER_PRO_ENTITLEMENT_ID, type ProBillingCycle } from "@/lib/proProduct";

/**
 * Black Friday 2026 (Amelia, 2026-11-24): Tue Nov 24 to Sun Nov 30, Pacific.
 *
 * - Pro members who were already Pro when the sale began: every cookbook $9.99.
 * - Everyone else: cookbooks $15.99, and Pro monthly $2.49 for 3 months, then
 *   $4.99 (a RevenueCat intro price on `pro_monthly_bf`, new subscribers only).
 *
 * Going Pro during the sale does NOT unlock $9.99: $2.49 + $9.99 would undercut
 * the $15.99 book and everyone would subscribe to cancel. So the non-Pro side
 * never sees "$9.99" anywhere.
 *
 * Every sale price is its own RevenueCat product, added to the existing
 * offerings as extra packages, the same way `cookbook_pro_first` is. The
 * product ids must match CookPilot's `recipePrinterRevenueCat.ts`, or a paid
 * book never unlocks. This date window only decides what the site SHOWS and
 * which package it picks; removing the packages from the offerings on Dec 1 is
 * what actually ends the sale.
 */

/** Tue Nov 24 2026, 00:00 PST. */
export const BLACK_FRIDAY_STARTS_AT_MS = Date.UTC(2026, 10, 24, 8, 0, 0);
/** Sun Nov 30 2026, 23:59:59 PST (end exclusive at midnight). */
export const BLACK_FRIDAY_ENDS_AT_MS = Date.UTC(2026, 11, 1, 8, 0, 0);

/** Local preview only: shows the sale on a dev server outside its dates. A
 *  deployed build never sets it. */
const PREVIEW = process.env.NEXT_PUBLIC_BLACK_FRIDAY_PREVIEW === "1";

export function isBlackFridayLive(nowMs: number = Date.now()): boolean {
  if (PREVIEW) return true;
  return nowMs >= BLACK_FRIDAY_STARTS_AT_MS && nowMs < BLACK_FRIDAY_ENDS_AT_MS;
}

export const BLACK_FRIDAY_COOKBOOK_PACKAGE_ID = "cookbook_bf";
export const BLACK_FRIDAY_COOKBOOK_PRODUCT_ID = "cookbook_bf";
export const BLACK_FRIDAY_PRO_COOKBOOK_PACKAGE_ID = "cookbook_pro_bf";
export const BLACK_FRIDAY_PRO_COOKBOOK_PRODUCT_ID = "cookbook_pro_bf";
export const BLACK_FRIDAY_PRO_MONTHLY_PACKAGE_ID = "pro_monthly_bf";
export const BLACK_FRIDAY_PRO_MONTHLY_PRODUCT_ID = "pro_monthly_bf";

export const BLACK_FRIDAY_COOKBOOK_PRICE = "$15.99";
export const BLACK_FRIDAY_PRO_COOKBOOK_PRICE = "$9.99";
export const BLACK_FRIDAY_PRO_MONTHLY_PRICE = "$2.49";
export const BLACK_FRIDAY_PRO_MONTHLY_MONTHS = 3;

/**
 * Was this account Pro before the sale began? Only they get the $9.99 book.
 *
 * Pro bought through the sale's own product is never "before". Otherwise the
 * entitlement's original purchase date decides. The server mirror (used only
 * while RevenueCat can't be reached) carries no dates; a Pro account it vouches
 * for that isn't on the sale product is treated as a member from before, so an
 * outage never charges a real member the higher price.
 */
export function wasProBeforeBlackFriday(customerInfo: CustomerInfo | null): boolean {
  const pro = customerInfo?.entitlements.active[RECIPEPRINTER_PRO_ENTITLEMENT_ID];
  if (!pro) return false;
  if (pro.expirationDate && pro.expirationDate.getTime() <= Date.now()) return false;
  if (pro.productIdentifier === BLACK_FRIDAY_PRO_MONTHLY_PRODUCT_ID) return false;
  const since = pro.originalPurchaseDate;
  if (!(since instanceof Date)) return true;
  return since.getTime() < BLACK_FRIDAY_STARTS_AT_MS;
}

/** Banner dismissal, and the `<html>` attributes the layout's inline script
 *  sets from it before first paint so a dismissed bar never flashes in. */
export const BLACK_FRIDAY_DISMISSED_KEY = "rp.blackFriday2026Dismissed";
export const BLACK_FRIDAY_DISMISSED_ATTR = "data-bf-dismissed";
export const BLACK_FRIDAY_PRO_ATTR = "data-bf-pro";

/** The plan a Pro picker opens on: Monthly during the sale, since that's the
 *  deal every "Claim offer" button points at; otherwise the usual default. */
export function proCycleToOpenOn(nowMs: number = Date.now()): ProBillingCycle {
  return isBlackFridayLive(nowMs) ? "monthly" : DEFAULT_PRO_CYCLE;
}

/** What the upgrade buttons say to someone not on Pro. */
export function upgradeButtonLabel(nowMs: number = Date.now()): string {
  return isBlackFridayLive(nowMs) ? "Claim offer" : "Upgrade to Pro";
}

/** The account's place in the sale, cached for the inline script so the right
 *  banner shows on first paint next time (components/SaleBanner.tsx). */
export const SALE_STANDING_KEY = "rp.sale2026Standing";
export type SaleStanding = "member" | "new" | "none" | "excluded";

/**
 * A Pro member who bought a cookbook before the sale began sits the sale out
 * (Amelia, 2026-11-24): no bar, no sale price. A first book bought DURING the
 * sale doesn't count, so a member's $9.99 book doesn't cost them the next one.
 */
export function sitsOutTheSale({
  hasPro,
  firstCookbookGrantedAt,
}: {
  hasPro: boolean;
  firstCookbookGrantedAt: number | null;
}): boolean {
  return hasPro && firstCookbookGrantedAt !== null && firstCookbookGrantedAt < BLACK_FRIDAY_STARTS_AT_MS;
}

/** importMeter's "this browser knows the cook is Pro" hint (lib/importMeter.ts
 *  `UNLIMITED_STORAGE_KEY`), read by the inline script below. */
const PRO_HINT_KEY = "recipeprinter:import-unlimited:v1";

/**
 * Runs in `<head>` before the page paints. Marks `<html>` with `data-sale`
 * while the sale runs, which switches the `rp-sale-only` / `rp-sale-hide`
 * text and shows the banner, plus whether the banner was dismissed and which
 * version to show. A browser that knows the cook is Pro but not yet whether
 * from before the sale is "pending": the banner waits for the check rather
 * than show a member the wrong offer. Server HTML is the same for everyone,
 * whenever it was built.
 */
export function saleInlineScript(): string {
  const start = BLACK_FRIDAY_STARTS_AT_MS;
  const end = BLACK_FRIDAY_ENDS_AT_MS;
  return `(function(){try{var d=document.documentElement,n=Date.now();if(!(${PREVIEW ? "true" : "false"}||(n>=${start}&&n<${end})))return;d.setAttribute("data-sale","");var l=window.localStorage;if(l.getItem(${JSON.stringify(BLACK_FRIDAY_DISMISSED_KEY)}))d.setAttribute(${JSON.stringify(BLACK_FRIDAY_DISMISSED_ATTR)},"");var s=l.getItem(${JSON.stringify(SALE_STANDING_KEY)});if(s==="member"||s==="new"||s==="excluded")d.setAttribute(${JSON.stringify(BLACK_FRIDAY_PRO_ATTR)},s);else if(s!=="none"&&l.getItem(${JSON.stringify(PRO_HINT_KEY)})==="true")d.setAttribute(${JSON.stringify(BLACK_FRIDAY_PRO_ATTR)},"pending");}catch(e){}})();`;
}
