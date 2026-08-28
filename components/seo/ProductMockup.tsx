// ─────────────────────────────────────────────────────────────────────────────
// The catalogue of SEO landing-page photography: real printed recipe cards.
//
// These are photographs of actual cards printed from RecipePrinter, sitting on a
// real table in real light. Nothing here is fabricated or greeked: the whole
// point is that a real printed card is the thing that sells the product, and no
// mockup can fake it.
//
// Data only — the components that FRAME these photos live in LandingVisuals.
// Files live in /public/images. Swap or add photos by editing PRINTED_CARDS.
// ─────────────────────────────────────────────────────────────────────────────

type PrintedCard = {
  src: string;
  /** Natural pixel dimensions of the source photo (portrait phone shots). */
  width: number;
  height: number;
  recipe: string;
  template: string;
  alt: string;
};

// The real card photos. Dimensions are the portrait phone-camera aspect (3:4);
// next/image only uses the ratio, so approximate is fine.
export const PRINTED_CARDS: Record<string, PrintedCard> = {
  /**
   * The one SOURCE photo in here, and the odd one out on purpose: a
   * handwritten card in someone's own hand, not a card RecipePrinter printed.
   *
   * It belongs on the family pages, where the subject is the recipe you
   * already have rather than the one you are about to make. `recipe` and
   * `template` describe what the photo IS — they are only rendered by the
   * examples gallery, which this is deliberately kept out of, because "Peanut
   * Butter Cookies · Heirloom layout" would claim we printed it.
   */
  jackie: {
    src: "/images/jackie-card.jpeg",
    width: 3763,
    height: 2822,
    recipe: "Peanut Butter Cookies",
    template: "Handwritten",
    alt: "A handwritten recipe card for peanut butter cookies, signed \"From Jackie (Nana)\", lying on a wooden board beside a floral recipe tin.",
  },
  caprese: {
    src: "/images/card-caprese-pasta-salad.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Caprese Pasta Salad",
    template: "Bistro",
    alt: "A Caprese pasta salad recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
  korean: {
    src: "/images/card-korean-beef-bowl.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Korean Beef Bowl",
    template: "Counter",
    alt: "A Korean beef bowl recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
  pesto: {
    src: "/images/card-basil-pesto.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Basil Pesto",
    template: "Keepsake",
    alt: "A basil pesto recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
};


