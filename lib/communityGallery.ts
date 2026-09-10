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
  /** Names the subject. Not an inventory of it. The pictures carry no visible
      caption, so this is the only description of them that exists. */
  alt: string;
  /** Nudges the crop when the photo's shape differs from the slot. */
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
 * box: the thread is the record of it, and a reply is the takedown. Kitchen
 * photos have other people's homes and families in them.
 *
 * The permission line names marketing rather than the website, because the
 * website is not the only place a photo like this ends up: a social post, an
 * app store screenshot and an ad are all uses that "we can show this on
 * recipeprinter.com" would not have covered. Asking once, in plain words, is
 * better than going back later for a second permission.
 */
export const GALLERY_SUBMIT_SUBJECT = "My RecipePrinter photo";

/** One entry per paragraph, never a wrapped line: a newline inside a sentence
    lands in the mail client as a hard break, and the draft arrived with the
    copy broken mid-sentence. Mail clients wrap on their own. */
export const GALLERY_SUBMIT_BODY = [
  "Attach a photo of what you printed.",
  "",
  "Sending it gives us permission to use the photo in our marketing, on the site and anywhere else we show what people make. Say the word any time and we'll take it down.",
  "",
  // Thanks for using it, not thanks for the submission: this text sits in a
  // draft the sender has not sent yet, so thanking them for something they
  // are still deciding to do reads as presumptuous. Using the product is a
  // thing they have already done.
  "Thanks for using RecipePrinter.",
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
