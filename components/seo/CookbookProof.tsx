import Image from "next/image";
import Link from "next/link";
import { PriceText } from "@/components/PriceText";
import { SectionHeading } from "@/components/seo/LandingFrame";
import { CustomerQuote } from "@/components/seo/CustomerQuote";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { FEATURE_IMAGES, LANDING_IMAGE_QUALITY } from "@/lib/seoAssets";

/**
 * The sell, straight after the hero on every cookbook page: finished books,
 * the three things no other cookbook maker gives you, and a customer saying
 * it in her own words. Short on purpose. The feature rows below explain;
 * this band is what someone who only scrolls once takes away.
 */

/** Photos of finished books, in the order the band prefers them. The page's
    own hero and feature images are skipped so no photo shows twice. */
const BOOK_PHOTOS: { key: string; caption: string }[] = [
  { key: "handwritten-card-in-book", caption: "Mom's card, printed beside her recipe" },
  { key: "bound-cookbook", caption: "A full-page photo facing every recipe" },
  { key: "printed-cookbook", caption: "Spiral-bound at a print shop" },
  { key: "spiral-and-binder", caption: "Spiral-bound, or at home in a binder" },
  { key: "dedication-page", caption: "A dedication at the front" },
];

const REASONS: { title: string; text: string }[] = [
  {
    title: "No typing",
    text: "Links, screenshots, and handwritten cards come in as finished recipes.",
  },
  {
    title: `${COOKBOOK_PRICE_FALLBACK} per book, not per copy`,
    text: "Print one for everyone in the family. You only pay for the printing.",
  },
  {
    title: "Free updates",
    text: "Add next year's recipes and download the new copy at no extra cost.",
  },
];

export function CookbookProof({
  usedImages,
  slug,
}: {
  usedImages: (string | undefined)[];
  slug: string;
}) {
  // Photos the page doesn't show yet first; a page that already uses most of
  // them repeats one rather than leaving a gap in the row of three.
  const available = BOOK_PHOTOS.filter((photo) => FEATURE_IMAGES[photo.key]);
  const photos = [
    ...available.filter((photo) => !usedImages.includes(photo.key)),
    ...available.filter((photo) => usedImages.includes(photo.key)),
  ].slice(0, 3);

  return (
    <section aria-labelledby="cookbook-proof-heading">
      {/* The heading names what follows it: the reasons. The photos come
          after, under their own line, as the proof of them. A heading of
          "Cookbooks made with RecipePrinter" over a row of reasons read as a
          mismatch. */}
      <div id="cookbook-proof-heading">
        <SectionHeading>Why make your cookbook here</SectionHeading>
      </div>

      <ul className="mt-cp-6 grid gap-cp-5 sm:grid-cols-3">
        {REASONS.map((reason) => (
          <li key={reason.title} className="border-t border-line pt-cp-4">
            <p className="text-cp-body-lg font-extrabold text-ink">
              <PriceText>{reason.title}</PriceText>
            </p>
            <p className="mt-cp-2 text-cp-body text-ink-soft leading-relaxed">{reason.text}</p>
          </li>
        ))}
      </ul>

      {/* A link in the copy of every cookbook page to the one meant to rank
          for "cookbook maker", in those words. On that page itself the line
          stays, without the link. */}
      <p className="mt-cp-7 text-cp-body-lg font-extrabold text-ink">
        Real cookbooks, made in the{" "}
        {slug === "cookbook-maker" ? (
          "online cookbook maker"
        ) : (
          <Link href="/cookbook-maker" className="text-ink underline underline-offset-2 hover:text-ink-soft">
            online cookbook maker
          </Link>
        )}
      </p>

      <div className="mt-cp-4 grid gap-cp-5 sm:grid-cols-3">
        {photos.map((photo) => {
          const image = FEATURE_IMAGES[photo.key];
          return (
            <figure key={photo.key} className="flex flex-col gap-cp-3">
              <div className="overflow-hidden rounded-xl border border-line bg-card p-1.5">
                <Image
                  src={image.src}
                  width={image.width}
                  height={image.height}
                  alt={image.alt}
                  sizes="(max-width: 640px) 90vw, 380px"
                  quality={LANDING_IMAGE_QUALITY}
                  className="w-full rounded-lg object-cover"
                  style={{ aspectRatio: "3 / 2", objectPosition: image.objectPosition }}
                />
              </div>
              <figcaption className="text-cp-caption font-semibold text-ink-soft">{photo.caption}</figcaption>
            </figure>
          );
        })}
      </div>

      <div className="mt-[56px]">
        <CustomerQuote />
      </div>
    </section>
  );
}
