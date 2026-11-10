"use client";

import Image from "next/image";
import { ArrowRightIcon, ICON_SIZE } from "@/components/icons";
import { PREVIEW_RULE } from "@/components/CookbookWelcomeDialog";
import { useFirstCookbookDiscount } from "@/components/HolidayCookbookBanner";
import { COOKBOOK_DISCOUNT_PRICE_FALLBACK, COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { useVisitorPrices } from "@/lib/visitorCurrency";

const STEPS = [
  { title: "Add recipes", body: "Links, photos of handwritten cards, or a recipe app." },
  { title: "Sort into chapters", body: "We handle the cover, contents and page numbers." },
  { title: "Download and print", body: "A print-ready PDF for home, a print shop, or Lulu." },
] as const;

/**
 * The homepage's Cookbook tab: the door into a new book, then how one gets
 * made.
 *
 * It used to be the Recipe cards box with a different button, so a book could
 * only begin by importing a recipe into it. A book is a cover, chapters and a
 * contents page that recipes go into over time, so this opens an empty book
 * and the recipes go in from inside it.
 *
 * No panel. Anything boxed under the tabs read as a banner dropped into the
 * page, however plain the box was; this sits on the page itself, the way the
 * hero above it does. Above the button, a photo of a real printed book: a
 * drawing of one read as fake, and a ghosted outline said nothing about what
 * you get. The button sits under it, not on it, so the pair never reads as
 * an ad.
 */
export function CookbookIntro({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const { label: local } = useVisitorPrices();
  const discounted = useFirstCookbookDiscount();
  return (
    <section aria-label="Start a cookbook" className="rp-cookbook-page animate-fade-up">
      <div className="rp-cookbook-page__go">
        {/* A real printed book, so the button says what it makes. */}
        <div className="rp-cookbook-hero">
          <Image
            src="/images/printed-cards/cookbook.jpeg"
            alt="A printed, spiral-bound cookbook open to a recipe for Greek chicken souvlaki"
            width={1333}
            height={2000}
            sizes="(max-width: 640px) 100vw, 400px"
            priority
            className="rp-cookbook-hero__photo"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary rp-cookbook-page__start"
          onClick={onStart}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Start a cookbook
          <ArrowRightIcon size={ICON_SIZE.md} />
        </button>
        {/* One sentence on a wide screen, two lines on a phone, where the
            sentence broke wherever the width happened to put it. */}
        <p className="rp-cookbook-page__price text-cp-small text-ink-soft">
          <b className="font-semibold text-ink">
            {local(discounted ? COOKBOOK_DISCOUNT_PRICE_FALLBACK : COOKBOOK_PRICE_FALLBACK)} one time
            {discounted && " with Pro"}.
          </b>{" "}
          <span>{PREVIEW_RULE}</span>
        </p>
      </div>
      <ol className="rp-cookbook-page__steps">
        {STEPS.map(({ title, body }, index) => (
          <li key={title}>
            <span className="cookbook-welcome__step-num" aria-hidden>{index + 1}</span>
            <div>
              <h3 className="text-cp-body font-bold text-ink">{title}</h3>
              <p className="mt-0.5 text-cp-small leading-snug text-ink-soft">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
