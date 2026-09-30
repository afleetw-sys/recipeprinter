"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { COOKBOOK_DISCOUNT_PRICE_FALLBACK, COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { useUsdPriceLabel } from "@/lib/visitorCurrency";

/**
 * The seasonal nudge under the front door: start the book now so it is done
 * (printed, or sent off to a printer) before the holidays.
 *
 * A large panel with the finished product in it: a hardcover book stands in
 * the right-hand corner, cut off by the panel's bottom edge, so it reads as
 * part of the panel rather than a picture placed on it. The ground is a
 * faded warm blur over cream, flat, with no border or shadow.
 *
 * It does not start its own import. The button is the Cookbook tab's
 * "start with nothing" path, handed in by PrinterWorkspace, so there is one way
 * a book begins and the welcome dialog on /print pitches the price over the
 * book itself, as it does from the tab.
 */
/** A hardcover mockup of a finished book, on a transparent background, so
    it stands on the panel's own gradient. */
const COOKBOOK_PEEK_IMAGE = "/images/cookbook-hardcover.webp";
const COOKBOOK_PEEK_WIDTH = 800;
const COOKBOOK_PEEK_HEIGHT = 1067;

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
  const price = useUsdPriceLabel();
  const discounted = useFirstCookbookDiscount();
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
            Build it at your own pace, then print at home or export it to any print shop.{" "}
            {discounted ? (
              // Just the price they will pay, no strikethrough: the welcome
              // dialog on /print does the explaining. "First" because the
              // discount is on one book only, and it names Pro so the lower
              // price reads as a membership perk.
              <>{price(COOKBOOK_DISCOUNT_PRICE_FALLBACK)} for your first cookbook, with your Pro membership.</>
            ) : (
              <>{price(COOKBOOK_PRICE_FALLBACK)} for unlimited recipes.</>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStart}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Start my cookbook
        </button>
      </div>
      {/* The book, standing in the corner and cut off by the bottom edge. */}
      <div aria-hidden className="rp-cookbook-offer__peek pointer-events-none">
        <Image
          src={COOKBOOK_PEEK_IMAGE}
          alt=""
          width={COOKBOOK_PEEK_WIDTH}
          height={COOKBOOK_PEEK_HEIGHT}
          sizes="(max-width: 767px) 60vw, 336px"
          className="block h-auto w-full"
        />
      </div>
    </section>
  );
}

/**
 * True once this browser's account is confirmed eligible for the Pro
 * first-cookbook price. Starts false, and stays false for anyone this browser
 * has never seen signed in: the check needs Firebase and RevenueCat, and the
 * homepage does not load either for a visitor who has no account to check.
 * For everyone else it waits for idle, like the header's avatar does.
 */
function useFirstCookbookDiscount(): boolean {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    if (!readCookPilotWasSignedIn()) return;
    let alive = true;
    const run = () => {
      import("@/lib/cookbookDiscountCheck")
        .then(({ checkFirstCookbookDiscount }) => checkFirstCookbookDiscount())
        .then((result) => {
          if (alive) setEligible(result);
        })
        .catch((error) => {
          console.warn("RecipePrinter: could not check the cookbook discount", error);
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
  return eligible;
}
