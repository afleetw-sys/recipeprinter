"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cookbookOfferFor, cookbookPriceLabel, isSaleDiscount, type CookbookOffer } from "@/lib/cookbookProduct";
import { SalePrice } from "@/components/SalePrice";
import { isBlackFridayLive } from "@/lib/blackFriday";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { useVisitorPrices } from "@/lib/visitorCurrency";

/**
 * The seasonal nudge under the front door: start the book now so it is done
 * (printed, or sent off to a printer) before the holidays.
 *
 * A large panel with the finished product in it: a photograph of a printed
 * book fills the right-hand side. The ground is a faded warm blur over cream,
 * flat, with no border or shadow.
 *
 * It does not start its own import. The button is the Cookbook tab's
 * "start with nothing" path, handed in by PrinterWorkspace, so there is one way
 * a book begins and the welcome dialog on /print pitches the price over the
 * book itself, as it does from the tab.
 */
/** A photograph of a printed, spiral-bound book. */
const COOKBOOK_PEEK_IMAGE = "/images/cookbook.jpeg";
const COOKBOOK_PEEK_WIDTH = 1600;
const COOKBOOK_PEEK_HEIGHT = 2400;

export function HolidayCookbookBanner({
  onStart,
  busy,
  onWarm,
}: {
  onStart: () => void;
  busy: boolean;
  /** Prefetches /print on first touch, same as the import panel. */
  onWarm?: () => void;
}) {
  const { label: price } = useVisitorPrices();
  const offer = useCookbookOffer();
  return (
    <section
      aria-labelledby="rp-holiday-cookbook-heading"
      className="rp-cookbook-offer relative -mx-3 mt-cp-3 overflow-hidden lg:mx-0"
      onPointerDownCapture={onWarm}
      onFocusCapture={onWarm}
    >
      <div className="rp-cookbook-offer__copy relative z-10 flex min-w-0 flex-col items-start gap-cp-4">
        <div>
          <h2 id="rp-holiday-cookbook-heading" className="rp-cookbook-offer__title text-ink">
            Make your cookbook in time for the holidays
          </h2>
          <p className="mt-cp-3 text-cp-body-lg leading-relaxed text-ink-soft">
            Build your cookbook and print it anywhere.{" "}
            {/* The price they will pay; during the sale, the regular one struck
                through before it. */}
            <>
              Preview up to 10 recipes free, then{" "}
              <SalePrice price={price(offer.price)} was={isSaleDiscount(offer.discount) ? price(offer.fullPrice) : null} />{" "}
              {cookbookPriceLabel(offer.discount, { withPro: true })} to download or add more.
            </>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStart}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Start a cookbook
        </button>
      </div>
      {/* The book, beside the copy (above it on a phone). */}
      <div aria-hidden className="rp-cookbook-offer__peek pointer-events-none">
        <Image
          src={COOKBOOK_PEEK_IMAGE}
          alt=""
          width={COOKBOOK_PEEK_WIDTH}
          height={COOKBOOK_PEEK_HEIGHT}
          sizes="(max-width: 767px) 240px, 520px"
          className="block h-full w-full object-cover"
        />
      </div>
    </section>
  );
}

/**
 * The cookbook price to show this browser's cook. It starts as the price for
 * someone who isn't Pro (the sale price during the sale, else full), and stays
 * that way for anyone this browser has never seen signed in: the check needs
 * Firebase and RevenueCat, and the homepage does not load either for a visitor
 * who has no account to check. For everyone else it waits for idle, like the
 * header's avatar does, then shows their own price.
 */
export function useCookbookOffer(): CookbookOffer {
  const [offer, setOffer] = useState<CookbookOffer>(() =>
    cookbookOfferFor({ hasPro: false, proBeforeSale: false, firstCookbookGrantedAt: null, saleLive: isBlackFridayLive() }),
  );
  useEffect(() => {
    if (!readCookPilotWasSignedIn()) return;
    let alive = true;
    const run = () => {
      import("@/lib/cookbookDiscountCheck")
        .then(({ checkCookbookOffer }) => checkCookbookOffer())
        .then((result) => {
          if (alive) setOffer(result);
        })
        .catch((error) => {
          console.warn("RecipePrinter: could not check the cookbook price", error);
        });
    };
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(run, { timeout: 3000 });
      return () => {
        alive = false;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = setTimeout(run, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return offer;
}
