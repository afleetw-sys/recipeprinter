import {
  BLACK_FRIDAY_COOKBOOK_PACKAGE_ID,
  BLACK_FRIDAY_COOKBOOK_PRICE,
  BLACK_FRIDAY_COOKBOOK_PRODUCT_ID,
  BLACK_FRIDAY_PRO_COOKBOOK_PACKAGE_ID,
  BLACK_FRIDAY_PRO_COOKBOOK_PRICE,
  BLACK_FRIDAY_PRO_COOKBOOK_PRODUCT_ID,
} from "@/lib/blackFriday";

// One purchase unlocks one stable cookbook project. The RevenueCat web product
// behind this identifier must be configured as a repeat-purchasable consumable;
// the permanent ownership record is our project-scoped unlock, not a global
// cookbook entitlement — there is no account-wide entitlement to read.
export const RECIPEPRINTER_COOKBOOK_OFFERING_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PACKAGE_ID = "cookbook";
export const RECIPEPRINTER_COOKBOOK_PRODUCT_ID = "cookbook";

// A second, discounted product/package — 20% off, for a Pro subscriber's
// first-ever cookbook — attached to the SAME "cookbook" entitlement as the
// regular product above, the same way pro_monthly/pro_annual are two priced
// variants of one "pro" entitlement. Must match
// RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID in CookPilot's
// functions/src/recipePrinterRevenueCat.ts (separate repo, kept in sync by
// hand). CookPilot's `recordFirstCookbookGrant` is what decides eligibility
// server-side (see lib/recipePrinterUserProfile.ts's
// `firstCookbookGrantedAt` for how the client reads that signal back).
export const RECIPEPRINTER_COOKBOOK_DISCOUNT_PACKAGE_ID = "cookbook_pro_first";
export const RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID = "cookbook_pro_first";

// The cookbook's price, shown wherever we name it ourselves (e.g. the welcome
// dialog). Checkout states the authoritative price; keep this in sync with the
// RevenueCat product if it ever changes.
export const COOKBOOK_PRICE_FALLBACK = "$19.99";
export const COOKBOOK_DISCOUNT_PRICE_FALLBACK = "$15.99";

/**
 * Is this signed-in Pro subscriber eligible for 20% off their first
 * cookbook — active Pro right now, and this account has never had a
 * cookbook grant land before. `hasPro` must already be resolved through
 * `lib/proAccessFallback.ts`'s live-or-bounded-fallback value (never the raw
 * SDK `customerInfo` directly) — a discount is money, so a momentary
 * RevenueCat outage must not wrongly charge a real Pro subscriber full
 * price the same way it must not wrongly lock them out of a feature.
 * `firstCookbookGrantedAt` is the server-written signal from
 * `lib/recipePrinterUserProfile.ts`'s profile read (CookPilot's
 * `recordFirstCookbookGrant`, write-once) — `null` means this account has
 * never received a cookbook.
 */
export function isFirstCookbookDiscountEligible({
  hasPro,
  firstCookbookGrantedAt,
}: {
  hasPro: boolean;
  firstCookbookGrantedAt: number | null;
}): boolean {
  return hasPro && firstCookbookGrantedAt === null;
}

/** Which discount a cookbook purchase uses, as checkout metadata and analytics
 *  carry it. Null is the full price. */
export type CookbookDiscount = "pro_first" | "black_friday" | "black_friday_pro";

export interface CookbookOffer {
  discount: CookbookDiscount | null;
  packageId: string;
  productId: string;
  /** What this cook pays, as a display fallback (checkout states the real one). */
  price: string;
  /** The regular price, for a struck-through "was". */
  fullPrice: string;
}

/**
 * The one cookbook price this cook is offered right now, and the RevenueCat
 * package that charges it. During Black Friday (lib/blackFriday.ts): a member
 * who was Pro before the sale gets $9.99 on every book, everyone else $15.99.
 * Otherwise the 20%-off-first rule above, or full price.
 */
export function cookbookOfferFor({
  hasPro,
  proBeforeSale,
  firstCookbookGrantedAt,
  saleLive,
}: {
  hasPro: boolean;
  proBeforeSale: boolean;
  firstCookbookGrantedAt: number | null;
  saleLive: boolean;
}): CookbookOffer {
  if (saleLive) {
    return hasPro && proBeforeSale
      ? {
          discount: "black_friday_pro",
          packageId: BLACK_FRIDAY_PRO_COOKBOOK_PACKAGE_ID,
          productId: BLACK_FRIDAY_PRO_COOKBOOK_PRODUCT_ID,
          price: BLACK_FRIDAY_PRO_COOKBOOK_PRICE,
          fullPrice: COOKBOOK_PRICE_FALLBACK,
        }
      : {
          discount: "black_friday",
          packageId: BLACK_FRIDAY_COOKBOOK_PACKAGE_ID,
          productId: BLACK_FRIDAY_COOKBOOK_PRODUCT_ID,
          price: BLACK_FRIDAY_COOKBOOK_PRICE,
          fullPrice: COOKBOOK_PRICE_FALLBACK,
        };
  }
  if (isFirstCookbookDiscountEligible({ hasPro, firstCookbookGrantedAt })) {
    return {
      discount: "pro_first",
      packageId: RECIPEPRINTER_COOKBOOK_DISCOUNT_PACKAGE_ID,
      productId: RECIPEPRINTER_COOKBOOK_DISCOUNT_PRODUCT_ID,
      price: COOKBOOK_DISCOUNT_PRICE_FALLBACK,
      fullPrice: COOKBOOK_PRICE_FALLBACK,
    };
  }
  return {
    discount: null,
    packageId: RECIPEPRINTER_COOKBOOK_PACKAGE_ID,
    productId: RECIPEPRINTER_COOKBOOK_PRODUCT_ID,
    price: COOKBOOK_PRICE_FALLBACK,
    fullPrice: COOKBOOK_PRICE_FALLBACK,
  };
}

/** The full-price offer: what tests and a cook with nothing known get. */
export const FULL_PRICE_COOKBOOK_OFFER: CookbookOffer = cookbookOfferFor({
  hasPro: false,
  proBeforeSale: false,
  firstCookbookGrantedAt: null,
  saleLive: false,
});

/** The words after a cookbook's price ("$15.99 per cookbook"), by offer. */
export function cookbookPriceLabel(
  discount: CookbookDiscount | null,
  { withPro = false }: { withPro?: boolean } = {},
): string {
  if (discount === "pro_first") return withPro ? "for your first cookbook with Pro" : "for your first cookbook";
  if (discount) return "per cookbook through Sunday";
  return "per cookbook";
}

/** A short line saying why the price is lower, or "" at full price. */
export function cookbookDiscountNote(discount: CookbookDiscount | null): string {
  if (discount === "pro_first") return "20% off your first cookbook with Pro.";
  if (discount === "black_friday_pro") return "Our thank-you sale price for Pro members, through Sunday.";
  if (discount === "black_friday") return "Sale price, through Sunday.";
  return "";
}
