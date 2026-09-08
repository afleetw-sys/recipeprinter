import Image from "next/image";
import { FEATURE_IMAGES } from "@/components/seo/LandingVisuals";

// ─────────────────────────────────────────────────────────────────────────
// Features stacked, not alternated: picture on top, name under it, the
// argument under that.
//
// FeatureRows sets the copy against the photo and flips the sides each row,
// which reads well when a page is arguing three things at length. A features
// page is a catalogue, and a catalogue is scanned down a column rather than
// read across one: stacking lets the eye run through the names in one pass
// instead of tracking left, right, left.
// ─────────────────────────────────────────────────────────────────────────

export type FeatureCard = {
  heading: string;
  body: string;
  /** A FEATURE_IMAGES key. Omit to render the placeholder frame. */
  image?: string;
  /** What the missing photograph should show. Rendered in the placeholder so
      the gap names itself instead of being a blank grey box nobody can act on. */
  needs?: string;
};

/**
 * The slot every card's visual sits in, so a placeholder occupies exactly the
 * space its photograph will and the grid does not reflow when one lands.
 */
const SLOT = "relative w-full overflow-hidden rounded-2xl border border-line bg-card";

export function FeatureCards({
  items,
  columns = 3,
}: {
  items: FeatureCard[];
  /** Pick the count the items fill: three leaves one stranded on a row of four. */
  columns?: 2 | 3;
}) {
  return (
    <ul
      className={`grid gap-cp-6 sm:grid-cols-2${columns === 3 ? " lg:grid-cols-3" : ""}`}
    >
      {items.map((item) => {
        const image = item.image ? FEATURE_IMAGES[item.image] : undefined;
        return (
          <li key={item.heading} className="flex flex-col gap-cp-4">
            {image ? (
              <div className={`${SLOT} p-1.5`}>
                <Image
                  src={image.src}
                  width={image.width}
                  height={image.height}
                  alt={image.alt}
                  sizes="(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 30vw"
                  className="w-full rounded-xl object-cover"
                  style={{ aspectRatio: "3 / 2", objectPosition: image.objectPosition }}
                />
              </div>
            ) : (
              // Deliberately quiet. A dashed "image goes here" box on a live
              // page looks broken to a visitor; this reads as a plain empty
              // frame, and the label tells us what to go and shoot.
              <div
                className={`${SLOT} flex items-center justify-center bg-[var(--cp-surface-sunken,var(--cp-paper))]`}
                style={{ aspectRatio: "3 / 2" }}
              >
                <p className="max-w-[22rem] px-cp-4 text-center text-cp-caption leading-relaxed text-ink-soft">
                  <span className="font-bold uppercase tracking-[0.08em]">Photo needed</span>
                  {item.needs && <span className="mt-cp-1 block">{item.needs}</span>}
                </p>
              </div>
            )}
            <div>
              <h3 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
                {item.heading}
              </h3>
              <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">{item.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
