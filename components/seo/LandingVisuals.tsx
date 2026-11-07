import Image from "next/image";
import { LANDING_IMAGE_QUALITY } from "@/lib/seoAssets";
import Link from "next/link";
import type { ReactNode } from "react";
import { PriceText } from "@/components/PriceText";
import { FEATURE_IMAGES, PRINTED_CARDS, type ProofImage } from "@/lib/seoAssets";
import type { SeoProofKind } from "@/lib/seoLandingPages";

// The image tables live in lib/seoAssets now (a server route reads them);
// re-exported here because this is where they are drawn and where callers
// already look for them.
export { FEATURE_IMAGES };
export type { ProofImage };

// ─────────────────────────────────────────────────────────────────────────────
// SEO landing-page visual system, clean, modern, and built only from real
// assets: real printed-card photographs and the real product UI. No fabricated
// graphics, no placeholder boxes. The look is restrained and crisp (hairline
// borders, generous whitespace, one teal accent used sparingly, subtle depth),
// so the pages read as intentionally designed rather than auto-generated.
// ─────────────────────────────────────────────────────────────────────────────

/* Clay in the EDGE, not behind the digit. Clay is 3.72:1, which clears the
   3:1 a border answers to and nothing more, so it draws the ring while the
   number stays ink on card. A tint here read as a caution around a step
   number that is only counting. See docs/color-roles.md. */
const stepCounter = {
  borderColor: "var(--cp-accent-warm)",
  background: "var(--cp-card)",
  color: "var(--cp-ink)",
} as const;

/**
 * A real printed-card photo in a clean modern frame: a soft accent halo for
 * depth, a hairline-bordered image, and one floating pill that ties the photo to
 * the product (e.g. "Printed from a link · 6×4 card"). The photo, an actual card
 * on a real table, is the proof; the frame just presents it well.
 */
export function HeroProductPhoto({
  cardKey = "korean",
  imageKey,
  imageAlt,
  annotation,
  priority = false,
  wide = false,
  crop = false,
  frame = "card",
}: {
  cardKey?: string;
  /** A FEATURE_IMAGES key, when a page's hero is not one of the card photos.
      Every utility page otherwise opens on the same Korean Beef Bowl card, so a
      page whose subject is something else (a handwritten card, say) had no way
      to say so. Takes precedence over `cardKey`. */
  imageKey?: string;
  imageAlt?: string;
  annotation?: string;
  priority?: boolean;
  wide?: boolean;
  /** Put the image in the shared 4:3 hero footprint. A framed photo is
      cropped to fill it; an unframed one (`frame: "none"`, a composed
      screenshot or transparent art) is fitted inside it whole, since
      cropping would cut off edges it was composed with. */
  crop?: boolean;
  /** `card` (default, unchanged everywhere else) is the light photo-frame
      every printed-card hero uses — a thin border, barely-there padding,
      cropped to a fixed 4:3. `document` is a dark, padded canvas with a
      shadow, for a hero that IS a document but still wants to read as
      something being VIEWED. `none` leaves the source completely unframed
      and uncropped, for transparent artwork or a composed screenshot that
      already owns its background and edges. */
  frame?: "card" | "document" | "none";
}) {
  const named = imageKey ? FEATURE_IMAGES[imageKey] : undefined;
  const card = named ?? PRINTED_CARDS[cardKey] ?? PRINTED_CARDS.korean;
  // The card photos are portrait with the card low in frame, so they need the
  // 86% crop to keep it centred. A named image is composed for a landscape
  // slot already; honour its own objectPosition, or leave it centred.
  const objectPosition = named
    ? (named.objectPosition ?? "50% 50%")
    : (card.objectPosition ?? "50% 86%");
  const isDocument = frame === "document";
  const isUncropped = !crop && (frame === "none" || isDocument);
  const image = (
    <Image
      src={card.src}
      width={card.width}
      height={card.height}
      alt={imageAlt ?? card.alt}
      sizes="(max-width: 1023px) 90vw, 460px"
      quality={LANDING_IMAGE_QUALITY}
      priority={priority}
      className={
        isDocument
          ? "h-auto w-full rounded-sm shadow-cp-xl"
          : isUncropped
            ? "h-auto w-full rounded-xl"
            : crop && frame === "none"
              ? "aspect-[4/3] w-full object-contain"
              : "aspect-[4/3] w-full rounded-xl object-cover"
      }
      style={isUncropped ? undefined : { objectPosition }}
    />
  );
  return (
    <div className={`relative mx-auto w-full ${wide ? "max-w-[860px]" : "max-w-[520px]"}`}>
      <div
        className={
          isDocument
            ? "overflow-hidden rounded-2xl bg-ink p-6 sm:p-10"
            : frame === "none"
              ? crop
                ? "overflow-visible border border-transparent bg-transparent p-1.5"
                : "overflow-visible bg-transparent"
              : "overflow-hidden rounded-2xl border border-line bg-card p-1.5"
        }
      >
        {image}
      </div>
      {annotation && (
        <span className="absolute -bottom-3 left-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-cp-3 py-1.5 text-cp-caption font-bold text-ink">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--cp-accent)" }} aria-hidden />
          {annotation}
        </span>
      )}
    </div>
  );
}

/** Numbered steps as a clean, connected row, big accent numerals, hairline spine. */
/** Links "RecipePrinter Pro" to /pricing wherever a step mentions it. The
    plan name is the one phrase in these short descriptions worth standing
    out, and it used to be bold text that led nowhere. The JSON-LD
    (`howToNode`, built from the same plain `step.text`) is unaffected, since
    this only touches how it's drawn, not the string itself. */
function boldProMentions(text: string) {
  const marker = "RecipePrinter Pro";
  const parts = text.split(marker);
  if (parts.length === 1) return <PriceText>{text}</PriceText>;
  return parts.map((part, i) => (
    <span key={i}>
      <PriceText>{part}</PriceText>
      {i < parts.length - 1 && (
        <Link href="/pricing" className="font-bold text-ink hover:underline">
          {marker}
        </Link>
      )}
    </span>
  ));
}

export function HowItWorks({ steps }: { steps: { name: string; text: string }[] }) {
  return (
    <ol className="grid gap-cp-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.name} className="relative">
          <div className="flex items-center gap-cp-3">
            <span
              className="grid h-10 w-10 flex-none place-items-center rounded-full border text-cp-small font-black"
              style={stepCounter}
            >
              {index + 1}
            </span>
            {index < steps.length - 1 && (
              <span className="hidden h-px flex-1 bg-line lg:block" aria-hidden />
            )}
          </div>
          <h3 className="mt-cp-3 font-bold tracking-[-0.01em]">{step.name}</h3>
          <p className="mt-cp-1 text-ink-soft text-cp-small leading-relaxed">
            {boldProMentions(step.text)}
          </p>
        </li>
      ))}
    </ol>
  );
}


/** One slot shape for every feature row, so the rows read as a set: a 3:2
    landscape rectangle at a fixed width. Composed visuals are authored at 3:2
    so nothing is cropped; the photographs are shot portrait and lean on
    `objectPosition` to keep the part that matters inside the frame. */
// Below `lg` the row is one full-width column, so the figure is capped to keep
// the image from going oversized. At `lg` it fills its grid column instead: the
// copy block already spans its column edge to edge, so a narrower image left the
// two halves starting and ending at different places, and centring it only moved
// the mismatch from one side to both.
const PROOF_SLOT = "w-full max-w-[520px] mx-auto lg:max-w-none";
const PROOF_ASPECT = "3 / 2";

/**
 * The real proof visual for each claim kind. Deliberately empty: the
 * photographs and product screenshots don't exist yet, and a feature row whose
 * kind isn't listed here renders as a full-width editorial block instead of a
 * dashed box. A live marketing page is better off showing no visual than one
 * labelled PRODUCT SCREENSHOT — the placeholder was shipping to production on
 * /print-recipe-from-website and /family-recipe-book. Add an entry here and the
 * row picks the two-column layout back up on its own, no page edits.
 */
/** Keyed by proof kind for the default, plus free-form keys a single feature
    row can name directly. Keying only by kind meant two rows asking for the
    same kind — on one page or across two — got the identical picture, which
    reads as one visual repeated rather than two claims. */
// ─────────────────────────────────────────────────────────────────────────
// Alt text names what the image shows. It does not inventory it.
//
// These ran to 40-84 words each, reading out recipe titles, cook times, serving
// counts and button labels. Three problems with that. Every one of these images
// sits in a row that already carries a heading and a paragraph making the same
// point, so a screen reader read the argument and then heard it again. Alt is a
// single unbroken string with no headings and nothing to skim, so there was no
// way past it. And length buys nothing in image search, which wants the subject,
// not the contents of a panel.
//
// So: the subject, in a line. Where the picture is an argument rather than a
// depiction, the argument survives the trim: before-after keeps both sides and
// keeps "26 pages" against "one card", because the contrast is the content.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Feature deep-dives as clean editorial rows: a strong heading on the left, body
 * on the right, separated by hairlines. Strong hierarchy and whitespace keep it
 * scannable rather than a wall of text, and it matches how Canva's own feature
 * sections are set (text-led, no decorative imagery).
 *
 * A row with a real proof image sits beside it in two columns, alternating
 * sides; a row without one runs full width at a readable measure.
 */
export function FeatureRows({
  features,
}: {
  features: {
    heading: string;
    /** ReactNode so a row can carry an inline link: CookbookPitch's own,
        and the `links` a landing page's feature row names. */
    body: ReactNode;
    afterBody?: ReactNode | ReactNode[];
    proof?: SeoProofKind;
    caption?: string;
    image?: string;
    imageAlt?: string;
  }[];
}) {
  // Rows sat `cp-7` apart, the same 32px that separates a row's copy from its
  // own image, so the gap between two rows and the gap inside one row were
  // identical and the set read as one undivided block. The vertical rhythm has
  // to land between the two it sits among: wider than the 32px column gap so a
  // row groups with its own image, and still short of the page's 72px gap
  // between sections so three rows read as one section rather than three.
  return (
    <div className="flex flex-col gap-[40px] lg:gap-[56px]">
      {features.map((feature, index) => {
        const image = feature.image
          ? FEATURE_IMAGES[feature.image]
          : feature.proof
            ? FEATURE_IMAGES[feature.proof]
            : undefined;
        const copy = (
          <>
            <h3 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
              <PriceText>{feature.heading}</PriceText>
            </h3>
            <p className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">
              <PriceText>{feature.body}</PriceText>
            </p>
            {[feature.afterBody ?? []].flat().map((paragraph, i) => (
              <p key={i} className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">
                <PriceText>{paragraph}</PriceText>
              </p>
            ))}
          </>
        );

        if (!image) {
          return (
            <div key={feature.heading} className="max-w-[46rem]">
              {copy}
            </div>
          );
        }

        return (
          <div key={feature.heading} className="grid items-center gap-cp-5 lg:grid-cols-2 lg:gap-cp-7">
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>{copy}</div>
            <figure className={`${PROOF_SLOT} ${index % 2 === 1 ? "lg:order-1" : ""}`}>
              <div className="overflow-hidden rounded-2xl border border-line bg-card p-1.5">
                <Image
                  src={image.src}
                  width={image.width}
                  height={image.height}
                  alt={feature.imageAlt ?? image.alt}
                  sizes="(max-width: 1023px) 92vw, 520px"
                  quality={LANDING_IMAGE_QUALITY}
                  className="w-full rounded-xl object-cover"
                  style={{ aspectRatio: PROOF_ASPECT, objectPosition: image.objectPosition }}
                />
              </div>
              {feature.caption && (
                <figcaption className="mt-cp-3 text-cp-caption font-semibold text-ink-soft">
                  {feature.caption}
                </figcaption>
              )}
            </figure>
          </div>
        );
      })}
    </div>
  );
}

/** The photo moment: the real printed cards, presented cleanly with quiet captions. */
export function PhotoGallery({ cardKeys }: { cardKeys: string[] }) {
  const keys = cardKeys.filter((k) => PRINTED_CARDS[k]);
  if (keys.length === 0) return null;
  return (
    <div className="grid gap-cp-5 sm:grid-cols-3">
      {keys.map((key) => {
        const card = PRINTED_CARDS[key];
        return (
          <figure key={key} className="flex flex-col gap-cp-3">
            <div className="overflow-hidden rounded-xl border border-line bg-card p-1.5">
              <Image
                src={card.src}
                width={card.width}
                height={card.height}
                alt={card.alt}
                sizes="(max-width: 640px) 90vw, 380px"
                quality={LANDING_IMAGE_QUALITY}
                className="aspect-square w-full rounded-lg object-cover"
                style={{ objectPosition: card.objectPosition ?? "50% 88%" }}
              />
            </div>
            <figcaption className="text-cp-caption font-semibold text-ink-soft">
              <span className="font-bold text-ink">{card.recipe}</span> · {card.template} layout
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

export { ComparisonTable } from "@/components/seo/ComparisonTable";
