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


