// ─────────────────────────────────────────────────────────────────────────
// "Off the printer": photographs of what people actually printed.
//
// Named for the thing rather than the room. "In real kitchens" claimed a
// setting the pictures do not have to be in, and the first three are on a
// garden table.
//
// The product's output is a physical object, and that is the one thing the
// homepage cannot otherwise show. A print preview is a rectangle on a screen;
// a photo of a spiral cookbook open on a counter answers the question a
// visitor actually has, which is whether this looks good on paper.
//
// Curated. Entries are committed here, so there is no upload endpoint, no
// Storage rules and no moderation queue.
//
// There is no way for a visitor to submit one at the moment. If that comes
// back, it belongs on email rather than an upload box, and the thread is what
// records the sender's permission: these are photographs of other people's
// homes, so the ask has to name where the picture may be used and how to have
// it taken down.
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
 * The seed set, shot at Amelia's: real cards off the real printer, not
 * renderings. They live in public/images/printed-cards/, away from the
 * product screenshots and marks that fill the rest of public/images.
 *
 * Keep the long edge at 2000px. The viewer shows one at 74vh, so a tall
 * display asks for about 900 CSS px, and 2000 covers that at 2x with room
 * spare. The noodles photograph arrived at 3024x4032 and 2.8MB, which the
 * image optimizer had to chew through on the first click.
 *
 * The three card photographs are PORTRAIT, whatever the file says. They are
 * stored landscape with an EXIF rotation that the image optimizer applies, so
 * `sips` reports 1600x1200 while the browser decodes 1200x1600. The sizes
 * below are the ones the browser sees; the numbers off the file would have
 * described every one of them as the wrong shape. The landscape slot crops
 * their top and bottom, which costs a little plant and a little table and
 * keeps the card.
 *
 * Empty this array and the gallery renders nothing at all rather than an empty
 * shell; see CommunityGallery for the dev-only placeholder that keeps the
 * layout visible while working on it.
 */
const SEED: CommunityPhoto[] = [
  {
    // Leads, because it is the only one that shows the card and the dinner it
    // produced in the same frame, which is the argument the others only imply.
    src: "/images/printed-cards/soy-sauce-noodles.jpeg",
    width: 1500,
    height: 2000,
    alt:
      "A printed Soy Sauce Pan-Fried Noodles card on a table beside the finished bowl of noodles and chopsticks.",
  },
  {
    // The only full-PAGE print in the set, and the only one shot from above.
    // Both are worth having: the strip otherwise argues for one format from
    // one angle.
    src: "/images/printed-cards/souvlaki.jpeg",
    width: 2000,
    height: 1500,
    alt:
      "A printed full-page Chicken Tzatziki Bowls recipe on a garden table beside the finished bowl.",
  },
  {
    src: "/images/printed-cards/card-korean-beef-bowl.jpeg",
    width: 1200,
    height: 1600,
    alt:
      "A printed Korean Beef Bowl card, spiral binding along its top edge, standing on a garden table.",
  },
  {
    src: "/images/printed-cards/card-basil-pesto.jpeg",
    width: 1200,
    height: 1600,
    alt:
      "A printed Basil Pesto card on ruled notebook paper, standing on a garden table.",
  },
  {
    src: "/images/printed-cards/card-caprese-pasta-salad.jpeg",
    width: 1200,
    height: 1600,
    alt:
      "A printed Caprese Pasta Salad card with a blue checkered border, standing on a garden table.",
  },
];

/**
 * TEMPORARY: the seed set runs twice so the strip is long enough to scroll on
 * a wide screen. Delete the second half the moment there are six real
 * photographs; a repeat is a placeholder, not a gallery.
 *
 * The repeats carry empty alt text. They are the same three pictures, and a
 * screen reader reading all three descriptions and then reading them again is
 * worse than silence on the ones that add nothing.
 */
export const COMMUNITY_PHOTOS: CommunityPhoto[] = [
  ...SEED,
  ...SEED.map((photo) => ({ ...photo, alt: "" })),
];
