"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { ChevronLeftIcon, ChevronRightIcon, ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";
import { useVisitorPrices } from "@/lib/visitorCurrency";
import { track } from "@/lib/analytics";
import { FREE_COOKBOOK_RECIPES, IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";

// The cookbook's own rule, stated before the first recipe so the cap is never
// a surprise. Always shown under the price, which is what says the preview is
// not the whole book.
export const PREVIEW_RULE = IMPORT_ALLOWANCE_LIVE
  ? `Free to build and preview with up to ${FREE_COOKBOOK_RECIPES} recipes.`
  : "Pay when you download.";

interface TourStep {
  title: string;
  body: string;
  image: {
    src: string;
    alt: string;
    width: number;
    height: number;
    position?: string;
    /** Crops into a photo that carries its own mat around the picture. A
        phone's picture is narrower, so it may need a closer crop. */
    zoom?: number;
    zoomPhone?: number;
  };
}

/**
 * What they'll get, one picture at a time, then the price (Amelia,
 * 2026-11-17). The old dialog listed four jobs and the price over an empty
 * book, and about four in ten people who saw it left without doing anything
 * (half on phones). Each step is a result, not a chore, and the price comes
 * last, after the book has been shown.
 */
const TOUR_STEPS: readonly TourStep[] = [
  {
    title: "Your recipes, as real cookbook pages",
    body: "Bring them in from any website, a photo, a handwritten card or a recipe app. Each one is laid out as a page, with its photo.",
    image: {
      src: "/images/cookbook-onboarding-hero.jpg",
      alt: "An open cookbook showing a photo of bourbon chicken beside its recipe page",
      width: 1536,
      height: 1024,
      position: "50% 50%",
    },
  },
  {
    title: "Chapters and contents, done for you",
    body: "Sort your recipes into chapters. We add the table of contents and number every page.",
    image: {
      src: "/images/binder/binder-section-page-wide.jpg",
      alt: "A printed chapter page called Appetizers in a recipe binder",
      width: 2400,
      height: 1600,
      position: "50% 50%",
      zoom: 1.55,
      zoomPhone: 2.05,
    },
  },
  {
    title: "A cover that's all yours",
    body: "Pick a theme and a cover, then make any page your own with notes and photos.",
    image: {
      src: "/images/cookbook-printed-cover.jpg",
      alt: "A printed spiral-bound family cookbook with a photo collage cover",
      width: 900,
      height: 1161,
      position: "50% 35%",
    },
  },
  {
    title: "That's all it takes. Ready to make yours?",
    body: "Download a print-ready PDF and print it at home, at a copy shop, or as a hardcover.",
    image: {
      src: "/images/binder/spiral-and-binder.jpg",
      alt: "Two printed family cookbooks, one spiral-bound and one in a binder",
      width: 2000,
      height: 1333,
      position: "50% 50%",
    },
  },
];

const LAST = TOUR_STEPS.length - 1;
// A swipe has to travel this far sideways (and more sideways than down) to
// turn the page, so a tap or a scroll never does.
const SWIPE_PX = 48;

type StepVia = "next" | "back" | "skip" | "swipe" | "key" | "dot";

/**
 * The cookbook walkthrough: full screen on every device. On a computer, the
 * picture fills the left and the words sit on the right; on a phone, the
 * picture is the top half and the cook swipes or taps Next. Escape and the X
 * close it; Skip goes straight to the last step, so the price and the way in
 * are never skipped.
 */
export function CookbookWelcomeDialog({
  open,
  price,
  fullPrice,
  hasRecipes,
  onStart,
  onLookAround,
  onClose,
}: {
  open: boolean;
  cover: CoverConfig;
  price: string;
  /** The regular price, when `price` is the Pro first-cookbook discount. Shown
      struck through first so $15.99 reads as a perk on this book, not as what
      a cookbook costs. */
  fullPrice?: string;
  /** The book already holds a recipe (one still importing counts): the cook
      got here by importing from the homepage, so `onStart` shows them the book
      instead of asking for a first recipe, and the button says so. */
  hasRecipes: boolean;
  onStart: () => void;
  /** Close onto the empty book without opening Add recipes. */
  onLookAround: () => void;
  /** Dismiss and stay in the book: the X, Escape and the backdrop. */
  onClose: () => void;
}) {
  const { label: local } = useVisitorPrices();
  const [step, setStep] = useState(0);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const atEnd = step === LAST;

  // Every opening starts at the beginning.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const go = (to: number, via: StepVia) => {
    const next = Math.max(0, Math.min(LAST, to));
    if (next === step) return;
    setStep(next);
    track("cookbook_tour_step", { step: next + 1, via });
  };

  // Arrow keys turn the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "ArrowRight") go(step + 1, "key");
      else if (event.key === "ArrowLeft") go(step - 1, "key");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") return;
    swipeFrom.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    go(step + (dx < 0 ? 1 : -1), "swipe");
  };

  const current = TOUR_STEPS[step];
  const discounted = Boolean(fullPrice && fullPrice !== price);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="cookbook-tour-title"
      className="cookbook-tour no-print"
      panelClassName="cookbook-tour__panel"
      portal
    >
      <div
        className="cookbook-tour__stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeFrom.current = null;
        }}
      >
        <div className="cookbook-tour__pictures" aria-hidden>
          {TOUR_STEPS.map((item, index) => (
            <div
              key={item.image.src}
              className={index === step ? "cookbook-tour__picture is-active" : "cookbook-tour__picture"}
            >
              <Image
                src={item.image.src}
                alt=""
                width={item.image.width}
                height={item.image.height}
                sizes="(max-width: 760px) 100vw, 58vw"
                priority={index === 0}
                loading={index === 0 ? undefined : "eager"}
                style={
                  {
                    objectPosition: item.image.position,
                    "--tour-zoom": item.image.zoom ?? 1,
                    "--tour-zoom-phone": item.image.zoomPhone ?? item.image.zoom ?? 1,
                  } as CSSProperties
                }
              />
            </div>
          ))}
        </div>

        <div className="cookbook-tour__copy">
          <div className="cookbook-tour__top">
            <div className="cookbook-tour__progress" role="group" aria-label="Steps">
              {TOUR_STEPS.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  className={index <= step ? "cookbook-tour__bar is-done" : "cookbook-tour__bar"}
                  aria-label={`Step ${index + 1} of ${TOUR_STEPS.length}`}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => go(index, "dot")}
                />
              ))}
            </div>
            <div className="cookbook-tour__top-actions">
              {!atEnd && (
                <button type="button" className="cookbook-tour__skip cookbook-tour__skip--top" onClick={() => go(LAST, "skip")}>
                  Skip
                </button>
              )}
              <button type="button" className="cookbook-tour__close icon-close-btn" aria-label="Close" onClick={onClose}>
                <XIcon size={ICON_SIZE.md} />
              </button>
            </div>
          </div>

          {/* Keyed by step so each one's words fade in fresh. */}
          <div key={step} className="cookbook-tour__words" aria-live="polite">
            <p className="cookbook-tour__count">
              {step + 1} of {TOUR_STEPS.length}
            </p>
            <h2 id="cookbook-tour-title">{current.title}</h2>
            <p className="cookbook-tour__body">{current.body}</p>

            {atEnd && (
              <div className="cookbook-tour__price">
                <p className="cookbook-tour__amount">
                  {discounted && (
                    <>
                      <s className="cookbook-tour__was">
                        <span className="sr-only">Was </span>
                        {local(fullPrice ?? price)}
                      </s>{" "}
                      <span className="sr-only">now </span>
                    </>
                  )}
                  {local(price)} <span className="cookbook-tour__per">per cookbook</span>
                </p>
                <p>{discounted ? `20% off your first cookbook with Pro. ${PREVIEW_RULE}` : PREVIEW_RULE}</p>
              </div>
            )}
          </div>

          <div className="cookbook-tour__actions">
            {atEnd ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary cookbook-tour__start"
                  onClick={() => {
                    track("cookbook_onboarding_started", { price, hasRecipes });
                    onStart();
                  }}
                >
                  {hasRecipes ? "Take a look" : "Start adding recipes"}
                </button>
                {!hasRecipes && (
                  <button type="button" className="btn btn-ghost" onClick={onLookAround}>
                    Look around first
                  </button>
                )}
              </>
            ) : (
              <>
                {step > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost cookbook-tour__back"
                    onClick={() => go(step - 1, "back")}
                  >
                    <ChevronLeftIcon size={ICON_SIZE.md} />
                    Back
                  </button>
                )}
                <button type="button" className="btn btn-primary cookbook-tour__next" onClick={() => go(step + 1, "next")}>
                  Next
                  <ChevronRightIcon size={ICON_SIZE.md} />
                </button>
                {/* On a phone Skip sits under Next, at the thumb, instead of
                    up by the close button (Amelia, 2026-11-17). */}
                <button
                  type="button"
                  className="cookbook-tour__skip cookbook-tour__skip--below"
                  onClick={() => go(LAST, "skip")}
                >
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
