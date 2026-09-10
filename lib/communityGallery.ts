// ─────────────────────────────────────────────────────────────────────────
// "Made in real kitchens": photographs of what people actually printed.
//
// The product's output is a physical object, and that is the one thing the
// homepage cannot otherwise show. A print preview is a rectangle on a screen;
// a photo of a spiral cookbook open on a counter answers the question a
// visitor actually has, which is whether this looks good on paper.
//
// Curated, not user-generated. Submissions arrive by email and land here as a
// committed entry, so approval is a pull request rather than a moderation
// queue: no upload endpoint, no Storage rules, no abuse surface. If this ever
// takes more than a few minutes a month, that is the point to build a real
// pipeline, and not before.
// ─────────────────────────────────────────────────────────────────────────

export type CommunityPhoto = {
  /** Path under /public/images. */
  src: string;
  /** Intrinsic size, so next/image reserves the space and nothing reflows. */
  width: number;
  height: number;
  /** Names the subject. Not an inventory of it. */
  alt: string;
  /** What was made, in a few words: "Spiral cookbook, 62 recipes". */
  caption: string;
  /** Who made it, as they asked to be credited. Omit when they'd rather not be. */
  credit?: string;
  /** Nudges the crop when the photo's shape differs from the square slot. */
  objectPosition?: string;
};

/**
 * Empty until the first photographs are shot. The gallery renders nothing at
 * all while this is empty, so the homepage never ships an empty shell; see
 * CommunityGallery for the dev-only placeholder that keeps the layout visible
 * while working on it.
 */
export const COMMUNITY_PHOTOS: CommunityPhoto[] = [];

export const GALLERY_SUBMIT_EMAIL = "recipeprinter@goodproblem.studio";

/**
 * Consent is the whole reason submissions come by email rather than an upload
 * box: the subject line is the record of it, and a reply is the takedown.
 * Kitchen photos have other people's families in them.
 */
export const GALLERY_SUBMIT_SUBJECT = "My RecipePrinter cookbook";

export const GALLERY_SUBMIT_BODY = [
  "Attach a photo or two of what you printed.",
  "",
  "What you made (a cookbook, recipe cards, a binder):",
  "How you'd like to be credited, if at all:",
  "",
  "Sending this means we can show the photo on recipeprinter.com.",
  "Change your mind any time and we'll take it down.",
].join("\n");

/**
 * Hand-encoded rather than built with URLSearchParams: that encodes a space as
 * "+", which a mail client drops into the body literally, so every space in the
 * draft came through as a plus sign. mailto wants percent-encoding.
 */
export function gallerySubmitHref(): string {
  const subject = encodeURIComponent(GALLERY_SUBMIT_SUBJECT);
  const body = encodeURIComponent(GALLERY_SUBMIT_BODY);
  return `mailto:${GALLERY_SUBMIT_EMAIL}?subject=${subject}&body=${body}`;
}
