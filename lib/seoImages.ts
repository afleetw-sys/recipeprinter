import { FEATURE_IMAGES, PRINTED_CARDS, type FeatureCard } from "@/lib/seoAssets";
import { COMMUNITY_PHOTOS } from "@/lib/communityGallery";
import { layoutForPage, type SeoLandingPage } from "@/lib/seoLandingPages";

// ─────────────────────────────────────────────────────────────────────────────
// Which photographs each indexable page actually renders.
//
// This exists for the image sitemap (app/image-sitemap.xml). Google finds a
// page's images by crawling the page, and ours are awkward to find that way:
// every one of them is lazy-loaded and served through the Next image optimizer,
// so the markup carries `/_next/image?url=%2Fimages%2F...&w=828&q=75` rather
// than a plain path ending in .jpeg. An image sitemap is the documented way to
// hand a crawler the list instead of hoping it infers it.
//
// The URLs here are the ORIGINALS under /public, not the optimizer's. Those are
// the stable, full-resolution files, they do not move when the optimizer's
// width buckets or quality setting change, and they are what should rank.
//
// Everything below reads the same records the components render from, so a
// photo swapped in FEATURE_IMAGES or PRINTED_CARDS follows automatically. The
// one thing that could drift is the CHOOSING, which is why `heroCardKey` lives
// here and app/[slug]/page.tsx calls it rather than repeating the ternary.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The printed-card photo a landing page opens on when it has not named a hero
 * image of its own. Guides open on the keepsake card, utility pages on the
 * everyday one. Called by both the page and the sitemap so they cannot disagree.
 */
export function heroCardKey(page: SeoLandingPage): string {
  return layoutForPage(page) === "guide-first" ? "pesto" : "korean";
}

/** Every image URL a landing page renders, in the order it renders them. */
export function landingPageImages(page: SeoLandingPage): string[] {
  const urls: string[] = [];

  // Hero: a named feature image wins, else the card photo for its layout.
  // Mirrors HeroProductPhoto's own `named ?? PRINTED_CARDS[cardKey]`.
  const hero = page.heroImage
    ? FEATURE_IMAGES[page.heroImage]
    : PRINTED_CARDS[heroCardKey(page)];
  if (hero) urls.push(hero.src);

  // Feature rows: an explicit `image` wins over the one `proof` would pick, and
  // a row with neither renders copy only. Mirrors FeatureRows.
  for (const section of page.featureSections ?? []) {
    const key = section.image ?? section.proof;
    const image = key ? FEATURE_IMAGES[key] : undefined;
    if (image) urls.push(image.src);
  }

  // The cookbook pitch is one fixed row, so its image is not page data.
  if (page.cookbookPitch) {
    const bound = FEATURE_IMAGES["bound-cookbook"];
    if (bound) urls.push(bound.src);
  }

  // The examples gallery, when the page has one.
  for (const key of page.examples ?? []) {
    const card = PRINTED_CARDS[key];
    if (card) urls.push(card.src);
  }

  // A page can legitimately show the same photo twice (a hero that is also an
  // example); Google wants each image once per page.
  return urls.filter((url, i) => urls.indexOf(url) === i);
}

/** The "Fresh off the printer" strip, which is the homepage's only photography. */
export function homeImages(): string[] {
  return COMMUNITY_PHOTOS.map((photo) => photo.src);
}

/**
 * The images in a run of FeatureCards, which is how /features and
 * /how-it-works show their proof. A card without an `image` renders the
 * placeholder frame and has nothing to list.
 */
export function featureCardImages(...runs: FeatureCard[][]): string[] {
  const urls = runs
    .flat()
    .map((card) => (card.image ? FEATURE_IMAGES[card.image]?.src : undefined))
    .filter((src): src is string => Boolean(src));
  return urls.filter((url, i) => urls.indexOf(url) === i);
}
