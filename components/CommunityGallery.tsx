"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon, ICON_SIZE, XIcon } from "@/components/icons";
import { Dialog } from "@/components/Dialog";
import { COMMUNITY_PHOTOS, type CommunityPhoto } from "@/lib/communityGallery";

// ─────────────────────────────────────────────────────────────────────────
// The clothing-shop "on real people" strip, for printed recipes.
//
// A scroll-snap track rather than a JS slider: the browser does the paging,
// so a swipe, a trackpad, a scrollbar drag, the arrow buttons and the arrow
// KEYS all land on the same positions, and it still works before hydration.
//
// Every measurement here is a percentage or an aspect ratio, never a pixel
// height. A carousel pinned to a fixed height stops growing when the page is
// zoomed and starts cropping its own pictures; sized off its container, this
// one just shows fewer photos at a time, which is what zoom is asking for.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The viewer's own controls, which are not the product's buttons.
 *
 * These were white cards on a hairline, the shape every control on the page
 * wears — correct on paper, wrong here: app chrome lifted onto a darkened
 * photograph reads as a dialog that landed on top of the picture rather than
 * as a way through it. Dark and translucent is what a photo viewer wears, and
 * it also fixes the contrast: white on the 62% scrim is about 3.5:1, which is
 * under what the counter's text needs, while white on this is past 8:1
 * whatever the photograph behind it happens to be doing.
 */
const VIEWER_CONTROL =
  "grid h-10 w-10 place-items-center rounded-full bg-ink/70 text-card transition-colors hover:bg-ink";

/** The frame every photo sits in, so a set of mixed shots reads as a set. */
const SLOT =
  "relative w-full overflow-hidden rounded-2xl border border-line bg-card";

/** A whole number of photos per band, never a sliced one.
    Above `sm` the width is the band divided by the count, minus the gaps, so
    the last photo in view ends exactly where the strip does. A fixed tile
    width could not do this: 15.5rem left a 1240px band showing four and a
    sliver, and a photograph cut down its middle by the edge of the page looks
    like a bug rather than an invitation to scroll.
    The count steps up with the band instead, which keeps every tile between
    235px and 275px wherever it lands. A phone keeps its trailing fraction,
    because there the peek is what says "swipe me" and a thumb is the control.
    (gap-cp-4 is 16px, so N across leaves (N-1) x 16px of gutter.) */
const ITEM = [
  "snap-start shrink-0",
  "basis-[62%]",
  "sm:basis-[calc((100%-32px)/3)]",
  "lg:basis-[calc((100%-48px)/4)]",
  "xl:basis-[calc((100%-64px)/5)]",
].join(" ");


export function CommunityGallery({
  items = COMMUNITY_PHOTOS,
}: {
  items?: CommunityPhoto[];
}) {
  // Nothing to show is a reason to show nothing. A live homepage carrying an
  // empty gallery and an "add yours" button reads as a broken feature, and it
  // asks a first-time visitor for something they have no way to give. In
  // development the placeholder keeps the layout visible while the first
  // photographs are still being shot.
  const showPlaceholder =
    items.length === 0 && process.env.NODE_ENV !== "production";
  const cards: CommunityPhoto[] = showPlaceholder ? PLACEHOLDERS : items;

  const [spotlight, setSpotlight] = useState<number | null>(null);

  if (cards.length === 0) return null;

  return (
    <section
      // No rule above the heading: the space is the separator, and it is
      // deliberately generous. This is now the ONLY thing setting the distance
      // between the card and the photographs, since the front door above no
      // longer reserves any height of its own.
      className="pt-[5rem] sm:pt-[10rem] flex flex-col gap-cp-3"
      aria-labelledby="rp-gallery-heading"
    >
      <Header />
      <Carousel
        count={cards.length}
        label="Photos of printed recipe cards"
      >
        {cards.map((photo, i) => (
          <li key={photo.src} className={ITEM}>
            {showPlaceholder ? (
              <Frame photo={photo} placeholder />
            ) : (
              // The accessible name is positional rather than the alt text.
              // The repeated photographs carry an empty alt on purpose, which
              // would otherwise leave their buttons unnamed.
              <button
                type="button"
                onClick={() => setSpotlight(i)}
                aria-label={`Open photo ${i + 1} of ${cards.length}`}
                className="block w-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Frame photo={photo} placeholder={false} />
              </button>
            )}
          </li>
        ))}
      </Carousel>

      {/* Always rendered, opened by the prop. Every other Dialog in the app is
          driven this way, and `useBackDismiss` is why: it pushes a history
          entry while open and pops it again on cleanup, so mounting and
          unmounting the Dialog itself fires a `popstate` that closes it the
          instant it opens. */}
      <Spotlight
        open={spotlight !== null}
        photos={cards}
        index={spotlight ?? 0}
        onIndex={setSpotlight}
        onClose={() => setSpotlight(null)}
      />
    </section>
  );
}

/**
 * One photograph, big, with the rest reachable from it.
 *
 * A printed card is the thing this section is arguing for, and at 235px you
 * can see that a card was printed but not what printing one gets you. The
 * strip is the index; this is where you actually look at one.
 *
 * Built on the shared `Dialog`, which brings the focus trap, the scroll lock,
 * Escape, and back-button dismissal on a phone, all of which a hand-rolled
 * overlay gets wrong.
 */
function Spotlight({
  open,
  photos,
  index,
  onIndex,
  onClose,
}: {
  open: boolean;
  photos: CommunityPhoto[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const count = photos.length;
  const go = useCallback(
    (direction: 1 | -1) => onIndex((index + direction + count) % count),
    [index, count, onIndex],
  );

  // The arrow KEYS, which is how anyone who has opened a photo viewer expects
  // to move through it. Escape is the Dialog's own.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, open]);

  if (!photo) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      portal
      dismissOnBackdropClick
      label="Photos of printed recipe cards"
      // `rp-photo-scrim`, a step darker than the shared `dialog-scrim`. A form
      // dialog paints its own white card and the scrim only has to separate
      // the two; a photograph paints no card, so the scrim is the surround.
      className="fixed inset-0 z-50 flex items-center justify-center rp-photo-scrim p-cp-4 sm:p-cp-6"
    >
      <div className="relative flex max-h-full flex-col items-center gap-cp-4">
        <Image
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt={photo.alt || `Printed recipe cards, photo ${index + 1} of ${count}`}
          // 560, not the 820 the box may reach. These are portrait photos in a
          // slot capped by HEIGHT, so the width they actually render at is
          // around 500px on a normal screen; asking for 820 made the browser
          // pick the 1920 bucket to cover a 2x display, which is a 196KB file
          // for a half-that picture.
          sizes="(max-width: 899px) 92vw, 560px"
          priority
          className="max-h-[74vh] w-auto rounded-lg object-contain"
        />

        <div className="flex items-center gap-cp-4">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className={VIEWER_CONTROL}
          >
            <ChevronLeftIcon size={ICON_SIZE.lg} />
          </button>
          <p className="rounded-full bg-ink/70 px-cp-3 py-cp-2 text-cp-caption font-semibold tabular-nums text-card">
            {index + 1} / {count}
          </p>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className={VIEWER_CONTROL}
          >
            <ChevronRightIcon size={ICON_SIZE.lg} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={`absolute right-cp-4 top-cp-4 ${VIEWER_CONTROL}`}
      >
        <XIcon size={ICON_SIZE.lg} />
      </button>
    </Dialog>
  );
}

/**
 * An eyebrow, not a second headline.
 *
 * At `text-cp-h2 font-extrabold` this sat at exactly the weight of "Add a
 * recipe", so the page offered a first-time visitor two equal things to look
 * at, and the photographs win that contest every time: they are the only
 * colour on an otherwise grey page. The section is proof, which is worth
 * having and worth having SECOND, so it takes the quiet label treatment the
 * rest of the product uses for supporting material.
 */
function Header() {
  return (
    <h2
      id="rp-gallery-heading"
      className="text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft"
    >
      Fresh off the printer
    </h2>
  );
}

function Frame({
  photo,
  placeholder,
}: {
  photo: CommunityPhoto;
  placeholder: boolean;
}) {
  if (placeholder) {
    // Development only, and loud about it, so nobody mistakes it for a styling
    // choice that shipped.
    return (
      <div
        className={`${SLOT} flex items-center justify-center bg-[var(--cp-surface-sunken,var(--cp-paper))]`}
        style={{ aspectRatio: "4 / 3" }}
      >
        <p className="px-cp-3 text-center text-cp-caption font-bold uppercase tracking-[0.08em] text-ink-soft">
          Photo needed
        </p>
      </div>
    );
  }

  return (
    <div className={`${SLOT} p-1`}>
      <Image
        src={photo.src}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        // Absolute above `sm`, not a viewport fraction: the page column stops
        // growing at 860px, so a percentage of the WINDOW kept asking for
        // bigger and bigger files that were never displayed any larger.
        sizes="(max-width: 639px) 62vw, 280px"
        className="w-full rounded-xl object-cover"
        style={{ aspectRatio: "4 / 3", objectPosition: photo.objectPosition }}
      />
    </div>
  );
}

/**
 * The track, plus the two arrows. The arrows are an addition to native
 * scrolling rather than the only way through: they're hidden from assistive
 * tech, because the track itself is already a labelled, focusable, arrow-key
 * scrollable region, and a screen reader announcing "next photo" buttons on
 * top of that is two interfaces for one control.
 */
function Carousel({
  children,
  count,
  label,
}: {
  children: React.ReactNode;
  count: number;
  label: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    // A pixel of slack: sub-pixel layout means scrollLeft rarely lands exactly
    // on 0 or on max, which left both arrows enabled forever at either end.
    setAtStart(track.scrollLeft <= 1);
    setAtEnd(track.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track) return;
    // The track's own width is the only thing that changes what fits: the
    // items are sized as a percentage of it, so a narrower window is what
    // turns a set that fitted into one that scrolls. A change in the number
    // of photos comes through `count` instead, since neither this box nor
    // the list's grows when its children overflow.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    // Belt and braces: the two signals can fail independently, and a
    // carousel whose arrows never update is worse than a duplicated
    // listener. A window resize is the change that matters here anyway.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, count]);

  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // Most of a screenful, not all of it, so the photo you were looking at
    // stays partly in view and the jump keeps its place.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({
      left: direction * track.clientWidth * 0.8,
      behavior: still ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative">
      {/* The scroll container is a div and the list is inside it, rather than
          one scrolling <ul>. `role="region"` replaces an element's own
          semantics, so putting it on the list cost the list its list-ness and
          a screen reader stopped announcing how many photos there are. */}
      <div
        ref={trackRef}
        onScroll={measure}
        // Focusable so the arrow keys reach it: a scroll container holding
        // content has to be reachable by keyboard, or the photos past the
        // fold are only available to a mouse.
        tabIndex={0}
        role="region"
        aria-label={label}
        // Proximity, not mandatory. Mandatory snapping insists on a resting
        // position for every scroll, and the item starts stop being reachable
        // once the last photo is in view, so the end of the track fights the
        // user. Proximity keeps the snap feel and lets the track settle
        // wherever it has to at the end.
        // Full bleed on a phone, with the page's own gutter as the track's
        // LEADING padding instead of a margin around it. The distinction is
        // the whole point: padding inside a scroll container scrolls away with
        // the content, so the strip starts lined up with the heading above it
        // and then runs to the edge of the screen once you move it, rather
        // than sliding photographs in and out of a permanent 24px gutter.
        // No trailing padding, so the last photograph ends at the edge and
        // there is no empty run after it to scroll through.
        // `scroll-pl` has to match the `pl`, or the leading gutter never gets
        // to be seen: snap positions are measured from the SNAPPORT, which
        // starts at the border edge unless scroll-padding moves it, so the
        // browser immediately scrolled the 24px away to bring the first
        // photograph flush and resting at the start was not a snap position.
        className="overflow-x-auto snap-x snap-proximity rp-gallery-track -mx-cp-6 pl-cp-6 pr-0 scroll-pl-cp-6 sm:mx-0 sm:px-0 sm:scroll-pl-0"
      >
        <ul className="flex gap-cp-4">{children}</ul>
      </div>

      {!atStart && <Arrow side="left" onClick={() => page(-1)} />}
      {!atEnd && <Arrow side="right" onClick={() => page(1)} />}
    </div>
  );
}

/**
 * One overlay arrow, sitting on the photos rather than under them, and only
 * ever rendered for a side that has something left to show. Flat on purpose:
 * a hairline on card is enough to separate it from a photograph, and the
 * shadows in this product are reserved for things that genuinely float.
 */
function Arrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  // Not on a phone. There the photo is most of the width, a swipe is the
  // obvious thing to do, and a button parked on top of the picture covers a
  // good part of the one thing this section exists to show.
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      // The track is already a labelled, focusable, arrow-key scrollable
      // region, so these stay out of the tab order and out of the
      // accessibility tree rather than being a second way to say the same
      // thing.
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      className={`absolute top-1/2 ${
        side === "left" ? "left-cp-2" : "right-cp-2"
      } -translate-y-1/2 hidden sm:grid h-10 w-10 place-items-center rounded-full
         border border-line-strong bg-card text-ink
         transition-colors hover:bg-[var(--cp-overlay-hover)]`}
    >
      <Icon size={ICON_SIZE.lg} />
    </button>
  );
}

/** Dev-only stand-ins. `src` doubles as the React key, so they stay distinct. */
const PLACEHOLDERS: CommunityPhoto[] = Array.from({ length: 5 }, (_, i) => ({
  src: `placeholder-${i}`,
  width: 4,
  height: 3,
  alt: "",
}));
