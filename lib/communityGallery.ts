// ─────────────────────────────────────────────────────────────────────────
// "Fresh off the printer": photographs of what people actually printed.
//
// Named for the thing rather than the room. "In real kitchens" claimed a
// setting the pictures do not have to be in: one is a garden table, several are
// a countertop, and the argument is the same from any of them.
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
 * Real cards and pages off a real printer, photographed rather than rendered.
 * They live in public/images/printed-cards/, away from the product screenshots
 * and marks that fill the rest of public/images.
 *
 * Keep the long edge at 2000px. The viewer shows one at 74vh, so a tall display
 * asks for about 900 CSS px, and 2000 covers that at 2x with room spare. This
 * batch arrived between 3000 and 3650px wide at 1.7–3.2MB each, which is bytes
 * nothing ever displays and an optimizer pass to chew through on first click.
 *
 * THE THUMBNAIL SLOT IS LANDSCAPE (4/3, `object-cover`) AND MOST OF THESE
 * PHOTOGRAPHS ARE PORTRAIT. A 1333x2000 photo therefore shows a 1000px-tall
 * window out of 2000 — the middle half, unless `objectPosition` moves it. Where
 * the card sits low in the frame, that default cuts it in half, so those
 * entries nudge the window down. The viewer is `object-contain` and shows the
 * whole photograph either way, which is where the props and the table are for.
 *
 * Empty this array and the gallery renders nothing at all rather than an empty
 * shell; see CommunityGallery for the dev-only placeholder that keeps the
 * layout visible while working on it.
 */
const PHOTOS: CommunityPhoto[] = [
  {
    // Leads on legibility: the highest-contrast card in the set, square to the
    // camera, filling its frame. A visitor deciding whether this is worth a try
    // is reading the first thumbnail, not admiring it.
    src: "/images/printed-cards/buffalo-chicken.jpeg",
    width: 1333,
    height: 2000,
    alt:
      "A printed Buffalo Chicken Bake card with a blue checkered edge, on a yellow surface between a jar of buffalo sauce and a tipped-over jar of onion powder.",
  },
  {
    // Second, and the only one that shows a card and the dinner it produced in
    // the same frame — the argument the rest of the strip only implies.
    src: "/images/printed-cards/soy-sauce-noodles.jpeg",
    width: 1500,
    height: 2000,
    alt:
      "A printed Soy Sauce Pan-Fried Noodles card on a table beside the finished bowl of noodles and chopsticks.",
  },
  {
    // The full-PAGE format, which prints a whole recipe at letter size instead
    // of splitting it across a card's two faces.
    src: "/images/printed-cards/crockpot-sesame.jpeg",
    width: 1333,
    height: 2000,
    // The page is taller than the window whatever we do, so this buys the top:
    // centred, the crop landed below the title and the thumbnail opened on the
    // word "Chicken" with no recipe name above it.
    objectPosition: "center 38%",
    alt:
      "A printed full-page Creamy Crockpot Sesame Chicken recipe on a wooden board, with a glass pot lid resting across one corner.",
  },
  {
    src: "/images/printed-cards/caprese-pasta.jpeg",
    width: 1333,
    height: 2000,
    // The card sits low in the frame; centred, the slot would cut it in half.
    objectPosition: "center 57%",
    alt:
      "A printed Caprese Pasta Salad card on a wooden board, with fresh basil and cherry tomatoes laid out above it.",
  },
  {
    // The only landscape frame and the only garden table. Sitting mid-run, it
    // breaks a stretch that would otherwise be five portrait shots indoors.
    src: "/images/printed-cards/souvlaki.jpeg",
    width: 2000,
    height: 1500,
    alt:
      "A printed full-page Chicken Tzatziki Bowls recipe on a garden table beside the finished bowl.",
  },
  {
    src: "/images/printed-cards/chicken-power-bowl.jpeg",
    width: 1333,
    height: 2000,
    objectPosition: "center 57%",
    alt:
      "A printed Hot Honey Chicken Power Bowl card with a blue checkered edge, on a red surface beside an avocado.",
  },
  {
    // Same recipe as the full page at position three, printed as a card
    // instead. Kept four apart so the pair reads as two formats rather than a
    // duplicate.
    src: "/images/printed-cards/sesame-chicken.jpeg",
    width: 1333,
    height: 2000,
    // Lowest card in the set: the default middle-half window would show mostly
    // tabletop and the top third of the card.
    objectPosition: "center 67%",
    alt:
      "A printed Creamy Crockpot Sesame Chicken card on a mustard notebook, with a trailing houseplant above it.",
  },
];

export const COMMUNITY_PHOTOS: CommunityPhoto[] = PHOTOS;
