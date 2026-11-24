"use client";

import { useEffect } from "react";
import { XIcon, ICON_SIZE } from "@/components/icons";
import { useFrontDoorUpgrade } from "@/components/FrontDoorUpgrade";
import { track } from "@/lib/analytics";
import {
  BLACK_FRIDAY_COOKBOOK_PRICE,
  BLACK_FRIDAY_DISMISSED_ATTR,
  BLACK_FRIDAY_DISMISSED_KEY,
  BLACK_FRIDAY_PRO_ATTR,
  BLACK_FRIDAY_PRO_COOKBOOK_PRICE,
  BLACK_FRIDAY_PRO_MONTHLY_MONTHS,
  SALE_STANDING_KEY,
  type SaleStanding,
} from "@/lib/blackFriday";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { localStore } from "@/lib/storage";
import { useVisitorPrices } from "@/lib/visitorCurrency";

function applyStanding(standing: SaleStanding) {
  const root = document.documentElement;
  if (standing === "none") root.removeAttribute(BLACK_FRIDAY_PRO_ATTR);
  else root.setAttribute(BLACK_FRIDAY_PRO_ATTR, standing);
  localStore.set(SALE_STANDING_KEY, standing);
}

function currentStanding(): SaleStanding {
  const value = document.documentElement.getAttribute(BLACK_FRIDAY_PRO_ATTR);
  return value === "member" || value === "new" ? value : "none";
}

/**
 * The sale bar above the header (lib/blackFriday.ts), dismissable. Always in
 * the server HTML and shown only by CSS: the layout's inline script marks
 * `<html>` during the sale, and with which version, before the page paints.
 *
 * Three versions, and "$9.99" is only ever in the member's: someone who isn't
 * Pro must never upgrade expecting a price going Pro now doesn't give.
 * - Not Pro, or signed out: the $15.99 book and Pro's intro price, "Claim offer".
 * - Pro since before the sale: their $9.99 book.
 * - Went Pro during the sale: the $15.99 book.
 *
 * Which one is settled here for a browser that has been signed in, then
 * cached so the next page paints the right one straight away.
 */
export function SaleBanner() {
  const { label: price } = useVisitorPrices();
  const [openUpgrade, upgradeDialog] = useFrontDoorUpgrade("sale_banner");

  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-sale")) return;
    if (!readCookPilotWasSignedIn()) {
      applyStanding("none");
      return;
    }
    let alive = true;
    import("@/lib/cookbookDiscountCheck")
      .then(({ checkSaleStanding }) => checkSaleStanding())
      .then((standing) => {
        if (alive) applyStanding(standing);
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not check the sale price", error);
        // Waiting on a check that failed: show the version for everyone
        // rather than nothing.
        if (alive && root.getAttribute(BLACK_FRIDAY_PRO_ATTR) === "pending") {
          root.removeAttribute(BLACK_FRIDAY_PRO_ATTR);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    localStore.set(BLACK_FRIDAY_DISMISSED_KEY, "1");
    document.documentElement.setAttribute(BLACK_FRIDAY_DISMISSED_ATTR, "");
    track("sale_banner_dismissed", { standing: currentStanding() });
  }

  return (
    <div role="region" aria-label="Sale" className="rp-sale-banner no-print">
      <p className="rp-sale-banner__text">
        <span className="rp-sale-banner__all">
          <b>Sale through Sunday:</b> cookbooks are {price(BLACK_FRIDAY_COOKBOOK_PRICE)}, and Pro is half off for
          your first {BLACK_FRIDAY_PRO_MONTHLY_MONTHS} months.
        </span>
        <span className="rp-sale-banner__member">
          <b>Thanks for being a Pro member.</b> Every cookbook is {price(BLACK_FRIDAY_PRO_COOKBOOK_PRICE)} through
          Sunday.
        </span>
        <span className="rp-sale-banner__new">
          <b>Sale through Sunday:</b> cookbooks are {price(BLACK_FRIDAY_COOKBOOK_PRICE)}.
        </span>{" "}
        <button type="button" className="rp-sale-banner__cta" onClick={openUpgrade}>
          Claim offer
        </button>
      </p>
      <button type="button" className="rp-sale-banner__close" aria-label="Dismiss sale banner" onClick={dismiss}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      {upgradeDialog}
    </div>
  );
}
