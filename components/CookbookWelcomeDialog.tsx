"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import type { CoverConfig } from "@/types/recipe";

export function CookbookWelcomeDialog({
  open,
  cover,
  price,
  purchased = false,
  onStart,
  onClose,
  onLeave,
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
  /**
   * Dismiss and stay in the book. This fires for the X, Escape and the
   * backdrop — every gesture that means "get this panel off my screen". It
   * used to also switch back to recipe cards, which threw away the book the
   * cook had just watched being built because they closed a panel.
   */
  onClose: () => void;
  /** Leave the book for recipe cards. Only the button that says so. */
  onLeave: () => void;
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
              : "Your cookbook is built."}
          </h2>
          <p>
            {purchased
              ? "Your cover, chapters and layout are all still here."
              : "Your recipes are laid out behind this, with a cover and chapters. Everything on it is yours to change."}
          </p>
        </div>
        <ul className="cookbook-feature-chips">
          {[
            "A cover you can put your own photo on",
            "Chapters and a table of contents, sorted for you",
            "Sized to print at Lulu, Staples or your own printer",
          ].map((item) => (
            <li key={item}><CheckIcon size={ICON_SIZE.sm} />{item}</li>
          ))}
        </ul>
        <div className="cookbook-welcome__price">
          {purchased ? (
            <span className="cookbook-welcome__owned">
              <CheckIcon size={ICON_SIZE.sm} />
              You own this cookbook. Export it as often as you like.
            </span>
          ) : (
            <>
              <b>{price}</b>
              <span>Paid once, the first time you export this cookbook. Editing it is free until then.</span>
            </>
          )}
        </div>
        {/* Cancel-left, commit-right, as every confirm dialog in the app is. */}
        <div className="cookbook-welcome__actions">
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Back to recipe cards</button>
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {purchased ? "Open my cookbook" : "Start editing"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function CookbookBuildReveal({ open }: { open: boolean }) {
  /**
   * One reveal, whatever the book has in it.
   *
   * This used to gather a pile of the cook's recipe photos — a good picture of
   * assembling a book FROM a collection, and the wrong one for the person
   * meeting this screen, who usually has one recipe and often no photo. The
   * fix was briefly a second animation for that case, which made the wait look
   * like two different operations depending on how much you happened to have.
   *
   * It is the same operation. It gets the same spinner.
   */
  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      closeDisabled
      label="Making your cookbook"
      className="cookbook-build-reveal no-print"
      portal
    >
      <div className="cookbook-build-reveal__glow" aria-hidden />
      <div className="cookbook-build-reveal__content">
        <span className="cookbook-build-reveal__spinner" aria-hidden>
          <SpinnerIcon size={32} />
        </span>
        <div className="cookbook-build-reveal__copy">
          <strong>Making your cookbook…</strong>
        </div>
      </div>
    </Dialog>
  );
}

