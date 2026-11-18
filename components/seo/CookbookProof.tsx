import Image from "next/image";
import Link from "next/link";
import { PriceText } from "@/components/PriceText";
import { CustomerQuote } from "@/components/seo/CustomerQuote";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { FEATURE_IMAGES, LANDING_IMAGE_QUALITY } from "@/lib/seoAssets";

/**
 * The sell, straight after the hero on every cookbook page: one finished book,
 * the three reasons to make it here, and a customer saying it in her own
 * words. Kept to one photo beside three short lines, the same shape as the
 * page's own feature rows: a row of reasons over a grid of three photos was
 * too much to take in at once.
 */

/** Photos of finished books, in the order the band prefers them. The first
    one the page doesn't already show is used; a page that shows them all
    gets the first. */
const BOOK_PHOTOS = [
  "bound-cookbook",
  "printed-cookbook",
  "handwritten-card-in-book",
  "spiral-and-binder",
  "dedication-page",
];

const linkClass = "font-bold text-ink hover:underline";

export function CookbookProof({
  usedImages,
  slug,
}: {
  usedImages: (string | undefined)[];
  slug: string;
}) {
  const available = BOOK_PHOTOS.filter((key) => FEATURE_IMAGES[key]);
  const imageKey = available.find((key) => !usedImages.includes(key)) ?? available[0];
  const image = FEATURE_IMAGES[imageKey];

  // A link in the copy of every cookbook page to the one meant to rank for
  // "cookbook maker", in those words. Plain text on that page itself.
  const maker =
    slug === "cookbook-maker" ? (
      "online cookbook maker"
    ) : (
      <Link href="/cookbook-maker" className={linkClass}>
        online cookbook maker
      </Link>
    );

  const reasons = [
    {
      title: "No typing.",
      text: (
        <>Add links, screenshots, or handwritten cards to the {maker}, and they come in as finished recipes.</>
      ),
    },
    {
      title: `${COOKBOOK_PRICE_FALLBACK} per book, not per copy.`,
      text: <>Print one for everyone in the family. You only pay for the printing.</>,
    },
    {
      title: "Free updates.",
      text: <>Add next year&rsquo;s recipes and download the new copy at no extra cost.</>,
    },
  ];

  return (
    <section aria-labelledby="cookbook-proof-heading">
      <div className="grid items-center gap-cp-5 lg:grid-cols-2 lg:gap-cp-7">
        <div>
          <h2 id="cookbook-proof-heading" className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
            Why make your cookbook here
          </h2>
          {reasons.map((reason) => (
            <p key={reason.title} className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">
              <span className="font-bold text-ink">
                <PriceText>{reason.title}</PriceText>
              </span>{" "}
              {reason.text}
            </p>
          ))}
        </div>
        <figure className="w-full max-w-[520px] mx-auto lg:max-w-none">
          <div className="overflow-hidden rounded-2xl border border-line bg-card p-1.5">
            <Image
              src={image.src}
              width={image.width}
              height={image.height}
              alt={image.alt}
              sizes="(max-width: 1023px) 92vw, 520px"
              quality={LANDING_IMAGE_QUALITY}
              className="w-full rounded-xl object-cover"
              style={{ aspectRatio: "3 / 2", objectPosition: image.objectPosition }}
            />
          </div>
        </figure>
      </div>

      <div className="mt-[56px]">
        <CustomerQuote />
      </div>
    </section>
  );
}
