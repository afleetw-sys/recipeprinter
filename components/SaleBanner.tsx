"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { XIcon, ICON_SIZE } from "@/components/icons";
import { useFrontDoorUpgrade } from "@/components/FrontDoorUpgrade";
import { useStartCookbook } from "@/components/seo/CookbookStartButton";
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

/** /print opens its own Pro dialog (its purchase updates the workspace), so the
 *  banner asks for it with this event rather than opening a second one. */
export const SALE_CLAIM_PRO_EVENT = "rp:sale-claim-pro";

/** The banner's height on `<html>`, so /print, which fills exactly one screen,
 *  can leave room for it. 0 when it's hidden or dismissed. */
const SALE_BANNER_HEIGHT_VAR = "--rp-sale-banner-h";

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
 * - Not Pro, or signed out: Pro's intro price, then the $15.99 book, with
 *   "Claim Pro" and "Claim cookbook".
 * - Pro since before the sale: their $9.99 book.
 * - Went Pro during the sale: the $15.99 book.
 *
 * Which one is settled here for a browser that has been signed in, then
 * cached so the next page paints the right one straight away.
 */
export function SaleBanner() {
  const { label: price } = useVisitorPrices();
  const [openUpgrade, upgradeDialog] = useFrontDoorUpgrade("sale_banner");
  const onPrint = usePathname() === "/print";
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const banner = bannerRef.current;
    if (!banner || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(SALE_BANNER_HEIGHT_VAR, `${banner.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty(SALE_BANNER_HEIGHT_VAR);
    };
  }, []);

  function claimPro() {
    if (onPrint) window.dispatchEvent(new Event(SALE_CLAIM_PRO_EVENT));
    else openUpgrade();
  }

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
    <div ref={bannerRef} role="region" aria-label="Sale" className="rp-sale-banner no-print">
      <div className="rp-sale-banner__inner">
        <span className="pro-sale-badge">Limited time offer</span>
        <p className="rp-sale-banner__text">
          {/* Both offers, Pro first (Amelia, 2026-11-24): most people buy Pro,
              not a book. */}
          <span className="rp-sale-banner__all">
            50% off your first {BLACK_FRIDAY_PRO_MONTHLY_MONTHS} months of Pro, and cookbooks are{" "}
            {price(BLACK_FRIDAY_COOKBOOK_PRICE)} this week.
          </span>
          <span className="rp-sale-banner__member">
            Just for Pro members: every cookbook is {price(BLACK_FRIDAY_PRO_COOKBOOK_PRICE)} until Sunday.
          </span>
          <span className="rp-sale-banner__new">
            Cookbooks are {price(BLACK_FRIDAY_COOKBOOK_PRICE)} until Sunday.
          </span>
        </p>
        <div className="rp-sale-banner__actions">
          <button type="button" className="rp-sale-btn rp-sale-btn--pro rp-sale-banner__for-all" onClick={claimPro}>
            Claim Pro
          </button>
          {/* Not on /print: a new book there would put away the one that's open. */}
          {!onPrint && <SaleCookbookButton />}
        </div>
      </div>
      <button type="button" className="rp-sale-banner__close" aria-label="Dismiss sale banner" onClick={dismiss}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      {upgradeDialog}
    </div>
  );
}

/** Opens a new cookbook. "Claim cookbook" for someone not on Pro, "Start a
 *  cookbook" for a member, whose price is already theirs. */
function SaleCookbookButton() {
  const { opening, start } = useStartCookbook();
  return (
    <button
      type="button"
      className="rp-sale-btn rp-sale-btn--book"
      aria-busy={opening || undefined}
      onClick={start}
    >
      <span className="rp-sale-banner__for-all">Claim cookbook</span>
      <span className="rp-sale-banner__for-pro">Start a cookbook</span>
    </button>
  );
}
