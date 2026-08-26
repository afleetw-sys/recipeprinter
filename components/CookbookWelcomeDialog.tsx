"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";

export function CookbookWelcomeDialog({
  open,
  cover,
  price,
  purchased = false,
  onStart,
  onClose,
}: {
  open: boolean;
  cover: CoverConfig;
  price: string;
  /**
   * This project's cookbook is already paid for — the cook switched to recipe
   * cards and is on their way back in. Every entry into a book goes through
   * this screen (one path, always, with the build reveal after it), so without
   * this it quoted $19.99 at someone who had already paid it, which is the
   * single loudest way to suggest their purchase didn't survive.
   */
  purchased?: boolean;
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
        {/* next/image, not a raw <img>: the source is a 2.4 MB PNG and this
            dialog only mounts when it opens, so a raw tag started that download
            at the exact moment the cook is being asked to pay — an empty panel
            on any connection that isn't fast. Served through the optimizer it
            arrives as WebP/AVIF at the ~460px the panel actually shows.
            `sizes` matches the panel's own breakpoint (see
            `.cookbook-welcome__panel` in globals.css); `priority` because it's
            in view the instant it mounts, so the default lazy load would just
            add a beat. The existing `width/height/object-fit` CSS still drives
            the layout — the width/height props are only the intrinsic ratio. */}
        <Image
          src="/images/cookbook-onboarding-hero.png"
          alt=""
          width={1536}
          height={1024}
          sizes="(max-width: 720px) 100vw, 460px"
          priority
        />
      </div>
      <div className="cookbook-welcome__copy">
        <div className="cookbook-welcome__lede">
          {/* This screen now opens ON TOP of the built book rather than in
              front of the idea of one, so it describes what is already on the
              screen behind it. */}
          <h2 id="cookbook-welcome-title">
            {purchased
              ? "Your cookbook is right where you left it."
              : "Here is your cookbook."}
          </h2>
          <p>
            {purchased
              ? "Your cover, chapters and layout were kept. Carry on where you stopped."
              : "Your recipes, laid out with a cover and chapters. Keep going and make it yours."}
          </p>
        </div>
        <ul className="cookbook-feature-chips">
          {["Professionally designed", "Automatically organized", "Ready for hardcover or spiral printing"].map((item) => (
            <li key={item}><CheckIcon size={ICON_SIZE.sm} />{item}</li>
          ))}
        </ul>
        <div className="cookbook-welcome__price">
          {purchased ? (
            <span className="cookbook-welcome__owned">
              <CheckIcon size={ICON_SIZE.sm} />
              You own this cookbook — export it as often as you like.
            </span>
          ) : (
            <>
              <b>{price}</b>
              <span>Pay only when you first export. One purchase per cookbook.</span>
            </>
          )}
        </div>
        <div className="cookbook-welcome__actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {purchased ? "Open my cookbook" : "Keep going"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Back to recipe cards</button>
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
