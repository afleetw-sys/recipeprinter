"use client";

import type { CSSProperties } from "react";
import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";

export function CookbookWelcomeDialog({
  open,
  cover,
  price,
  onStart,
  onClose,
}: {
  open: boolean;
  cover: CoverConfig;
  price: string;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="cookbook-welcome-title"
      className="cookbook-welcome no-print"
      backdropClassName="cookbook-welcome__backdrop"
      panelClassName="cookbook-welcome__panel"
      portal
    >
      <button type="button" className="cookbook-welcome__close icon-close-btn" aria-label="Close" onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      <div className="cookbook-welcome__visual" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/cookbook-onboarding-hero.png" alt="" />
      </div>
      <div className="cookbook-welcome__copy">
        <div className="cookbook-welcome__lede">
          <h2 id="cookbook-welcome-title">Turn your favorite recipes into a cookbook you&apos;ll keep forever.</h2>
          <p>A beautifully designed cookbook you&apos;ll be proud to print, gift, and pass down.</p>
        </div>
        <ul className="cookbook-feature-chips">
          {["Professionally designed", "Automatically organized", "Ready for hardcover or spiral printing"].map((item) => (
            <li key={item}><CheckIcon size={ICON_SIZE.sm} />{item}</li>
          ))}
        </ul>
        <div className="cookbook-welcome__price">
          <b>{price}</b>
          <span>One purchase per cookbook. Pay only when you first export.</span>
        </div>
        <div className="cookbook-welcome__actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>Create my cookbook</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Not now</button>
        </div>
      </div>
    </Dialog>
  );
}

export function CookbookBuildReveal({
  open,
  images,
}: {
  open: boolean;
  /** The cook's own recipe photos — gathered into a stack while the book
      assembles. Repeated to fill the pile when there are only a few. */
  images: string[];
}) {
  const pics = Array.from(new Set(images.filter(Boolean)));
  // A tidy pile of ~7 cards; cycle through the recipe photos (repeating when
  // there are fewer) so it always reads as a full gather, never a lone card.
  const CARD_COUNT = 7;
  const cards = Array.from({ length: CARD_COUNT }, (_, index) =>
    pics.length ? pics[index % pics.length] : null,
  );
  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      closeDisabled
      label="Building your cookbook"
      className="cookbook-build-reveal no-print"
      portal
    >
      <div className="cookbook-build-reveal__glow" aria-hidden />
      <div className="cookbook-build-reveal__content">
        <div className="cookbook-gather" aria-hidden>
          <div className="cookbook-gather__base" />
          <div className="cookbook-gather__stack">
            {cards.map((src, index) => (
              <div
                className="cookbook-gather__card"
                key={index}
                style={{ "--i": index } as CSSProperties}
              >
                <div className="cookbook-gather__card-inner">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="cookbook-build-reveal__copy">
          <span>Gathering your recipes</span>
          <strong>Creating your cookbook…</strong>
        </div>
      </div>
    </Dialog>
  );
}
