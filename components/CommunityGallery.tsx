import Image from "next/image";
import {
  COMMUNITY_PHOTOS,
  gallerySubmitHref,
  type CommunityPhoto,
} from "@/lib/communityGallery";

// ─────────────────────────────────────────────────────────────────────────
// The clothing-shop "on real people" strip, for printed recipes.
//
// A grid rather than a horizontal scroller on purpose. A scroller hides most
// of itself, needs its own affordance to say so, and is awkward under heavy
// zoom, where a fixed-height strip stops growing with the text inside it. A
// grid just drops to fewer columns and keeps every photo reachable.
// ─────────────────────────────────────────────────────────────────────────

/** The frame every photo sits in, so a set of mixed shots reads as a set. */
const SLOT =
  "relative w-full overflow-hidden rounded-2xl border border-line bg-card";

export function CommunityGallery({
  items = COMMUNITY_PHOTOS,
}: {
  items?: CommunityPhoto[];
}) {
  // Nothing to show is a reason to show nothing. A live homepage carrying an
  // empty gallery and an "add yours" button reads as a broken feature, and it
  // asks a first-time visitor for something they have no way to give. In
  // development the placeholder below keeps the layout visible while the first
  // photographs are still being shot.
  const showPlaceholder =
    items.length === 0 && process.env.NODE_ENV !== "production";
  if (items.length === 0 && !showPlaceholder) return null;

  return (
    <section
      className="border-t border-line pt-cp-7 flex flex-col gap-cp-5"
      aria-labelledby="rp-gallery-heading"
    >
      <div className="flex items-end justify-between gap-cp-4 flex-wrap">
        <div className="max-w-[42rem]">
          <h2
            id="rp-gallery-heading"
            className="text-cp-h2 font-extrabold tracking-[-0.02em]"
          >
            Made in real kitchens
          </h2>
          <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
            Cookbooks, recipe cards, and binders people printed and sent us
            photos of.
          </p>
        </div>

        {/* An email, not an upload box. The people browsing this are mostly
            prospects with nothing to submit yet, so the volume does not
            justify a pipeline, and a reply thread is a consent record.

            It wraps to its own line below `sm`, where `ml-auto` stranded it
            right-aligned in open space with nothing to align to. Flush left
            under the copy it belongs to, and pushed right only once it shares
            a line with the heading. */}
        <a
          href={gallerySubmitHref()}
          className="btn btn-secondary btn-compact mr-auto sm:ml-auto sm:mr-0 shrink-0"
        >
          Add yours
        </a>
      </div>

      {showPlaceholder ? (
        <PlaceholderGrid />
      ) : (
        <ul className="grid gap-cp-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo) => (
            <li key={photo.src} className="flex flex-col gap-cp-2">
              <div className={`${SLOT} p-1.5`}>
                <Image
                  src={photo.src}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.alt}
                  sizes="(max-width: 639px) 46vw, (max-width: 1023px) 30vw, 23vw"
                  className="w-full rounded-xl object-cover"
                  style={{
                    aspectRatio: "4 / 3",
                    objectPosition: photo.objectPosition,
                  }}
                />
              </div>
              <p className="text-cp-caption leading-relaxed text-ink-soft">
                {photo.caption}
                {photo.credit && (
                  <span className="block text-ink font-semibold">
                    {photo.credit}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Development only, and loud about it, so nobody mistakes it for a styling
 * choice that shipped. Four tiles because that is one full row at `lg`.
 */
function PlaceholderGrid() {
  return (
    <ul className="grid gap-cp-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {["Spiral cookbook on a counter", "4×6 cards in a recipe box", "Binder open on a stand", "A stack, fanned out"].map(
        (needs) => (
          <li key={needs} className="flex flex-col gap-cp-2">
            <div
              className={`${SLOT} flex items-center justify-center bg-[var(--cp-surface-sunken,var(--cp-paper))]`}
              style={{ aspectRatio: "4 / 3" }}
            >
              <p className="px-cp-3 text-center text-cp-caption leading-relaxed text-ink-soft">
                <span className="font-bold uppercase tracking-[0.08em]">
                  Photo needed
                </span>
                <span className="mt-cp-1 block">{needs}</span>
              </p>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
