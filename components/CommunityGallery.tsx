"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon, ICON_SIZE } from "@/components/icons";
import {
  COMMUNITY_PHOTOS,
  gallerySubmitHref,
  type CommunityPhoto,
} from "@/lib/communityGallery";

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

/** The frame every photo sits in, so a set of mixed shots reads as a set. */
const SLOT =
  "relative w-full overflow-hidden rounded-2xl border border-line bg-card";

/** Roughly one-and-a-bit photos on a phone, four across on a wide screen. The
    trailing fraction is the affordance: a half-visible next photo says "this
    scrolls" better than any arrow does. */
const ITEM =
  "snap-start shrink-0 basis-[78%] sm:basis-[46%] lg:basis-[30%] xl:basis-[23%]";

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

  if (cards.length === 0) return null;

  return (
    <section
      // No rule above the heading: the space is the separator. The padding
      // stays, on top of the page column's own gap, because whitespace has to
      // be generous to do the job a hairline was doing.
      className="pt-cp-7 flex flex-col gap-cp-5"
      aria-labelledby="rp-gallery-heading"
    >
      <Header />
      <Carousel
        count={cards.length}
        label="Photos of printed cookbooks and recipe cards"
      >
        {cards.map((photo) => (
          <li key={photo.src} className={ITEM}>
            <Frame photo={photo} placeholder={showPlaceholder} />
          </li>
        ))}
      </Carousel>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between gap-cp-4 flex-wrap">
      <h2
        id="rp-gallery-heading"
        className="text-cp-h2 font-extrabold tracking-[-0.02em]"
      >
        Made in real kitchens
      </h2>

      {/* An email, not an upload box. The people browsing this are mostly
          prospects with nothing to submit yet, so the volume does not justify
          a pipeline, and a reply thread is a consent record. */}
      <a
        href={gallerySubmitHref()}
        className="btn btn-secondary btn-compact mr-auto sm:ml-auto sm:mr-0 shrink-0"
      >
        Add yours
      </a>
    </div>
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
    <div className={`${SLOT} p-1.5`}>
      <Image
        src={photo.src}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        sizes="(max-width: 639px) 78vw, (max-width: 1023px) 46vw, 30vw"
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
        className="overflow-x-auto snap-x snap-proximity rp-gallery-track"
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
