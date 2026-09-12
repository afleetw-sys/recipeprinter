/**
 * The SEO pages' image tables and the shapes they use, as data.
 *
 * Split out of components/seo/LandingVisuals, ProductMockup and FeatureCards,
 * which is where they are RENDERED. They are also read by lib/seoImages and
 * lib/seoFeatureCards, and through those by `app/image-sitemap.xml/route.ts` —
 * a server route that emits XML and had no business pulling a 500-line React
 * component tree to look up an image width.
 *
 * Same move, and the same reason, as the card option tables in
 * lib/printTemplates: where a thing is DRAWN is not where its vocabulary
 * belongs. Nothing here renders; each component re-exports what it owns, so
 * every existing import site is unaffected.
 */

export type ProofImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Where the crop sits when the source shape differs from the slot's. */
  objectPosition?: string;
};

export type PrintedCard = {
  src: string;
  /** Natural pixel dimensions of the source photo (portrait phone shots). */
  width: number;
  height: number;
  recipe: string;
  template: string;
  alt: string;
};

export type FeatureCard = {
  heading: string;
  body: string;
  /** A FEATURE_IMAGES key. Omit to render the placeholder frame. */
  image?: string;
  /** What the missing photograph should show. Rendered in the placeholder so
      the gap names itself instead of being a blank grey box nobody can act on. */
  needs?: string;
};

export const FEATURE_IMAGES: Record<string, ProofImage> = {
  "multi-themes": {
    src: "/images/multi-themes.png",
    width: 2400,
    height: 1520,
    // Authored wider than the 3:2 slot, so about 5% comes off each side. The
    // composition already runs cards off both edges, so the crop takes more of
    // an edge that was cut on purpose rather than breaking a whole card.
    alt:
      "One recipe printed as six cards in six different print themes, each with its own typeface, border and color.",
  },
  "counter-card": {
    src: "/images/crowded-counter.jpeg",
    width: 1800,
    height: 1245,
    alt:
      "A printed Buffalo Chicken Bake card on a kitchen counter beside the ingredients it calls for.",
  },
  "pdf-search": {
    src: "/images/pdf-search.png",
    width: 2400,
    height: 1436,
    // Wider than the 3:2 slot, so about 5% comes off each side. The window's
    // own edges sit just inside that, and the circled search field survives it.
    alt:
      "A saved recipe PDF open in a document viewer, with a search for sesame oil finding it on two pages.",
  },
  "handwritten-card": {
    src: "/images/jackie-card.jpeg",
    width: 1800,
    height: 1350,
    alt:
      "A handwritten Peanut Butter Cookies recipe card in cursive, lying beside an open floral recipe box.",
  },
  "mobile-vs-desktop": {
    src: "/images/mobile-vs-desktop.png",
    width: 2400,
    height: 1436,
    // Wider than the 3:2 slot, so about 5% comes off each side. Both address
    // bars sit well inside that, which is the only part that has to survive:
    // they are the proof this is a web page and not an app.
    alt:
      "RecipePrinter open side by side in a desktop browser and a phone browser, running the same thing in both.",
  },
  "bound-cookbook": {
    src: "/images/cookbook-onboarding-hero.jpg",
    width: 1536,
    height: 1024,
    alt:
      "A finished hardcover family cookbook lying open on a counter, a full-page photo facing the typed recipe.",
  },
  "cookpilot-export": {
    src: "/images/cookpilot-export.png",
    width: 1600,
    height: 957,
    alt:
      "A CookPilot library of 64 recipes open in RecipePrinter, with recipes being added to the print queue alongside.",
  },
  "inline-editing": {
    src: "/images/inline-editing.png",
    width: 1600,
    height: 957,
    alt:
      "An ingredient line being edited directly on a recipe card, with the formatting bar open above it and print setup down the side.",
  },
  "show-photo": {
    src: "/images/show-photo.png",
    width: 1600,
    height: 957,
    alt:
      "The same recipe card printed twice, with and without a photo, set by a single toggle between them.",
  },
  "card-in-box": {
    src: "/images/recipe-card-in-box.jpg",
    width: 1448,
    height: 1086,
    // Authored 4:3, so the 3:2 slot trims about 5% off the top and bottom and a
    // centred crop keeps both the card's title and the box's RECIPES plate. The
    // earlier portrait shot needed `objectPosition: 50% 30%` to save the title;
    // this crop does not, and leaving it in would push the plate off instead.
    alt:
      "A printed Basil Pesto card standing in an open recipe box behind tabbed dividers.",
  },
  card: {
    src: "/images/cards-on-counter.jpeg",
    width: 1600,
    height: 1200,
    alt:
      "Five printed recipe cards in different designs fanned across a counter beside an open recipe box.",
  },
  steps: {
    src: "/images/seo-pasted-text.png",
    width: 2400,
    height: 1600,
    alt:
      "A recipe pasted in as one unbroken run of text, beside the finished card it becomes.",
  },
  "paste-in-app": {
    src: "/images/recipes-fight-back.png",
    width: 2400,
    height: 1436,
    alt:
      "A recipe pasted as plain lines into RecipePrinter's Text box, ready to add.",
  },
  instagram: {
    src: "/images/instagram.png",
    width: 2400,
    height: 1436,
    alt:
      "An Instagram post with the recipe written out in its caption, beside the printed recipe card it becomes.",
  },
  "before-after": {
    src: "/images/print-to-one.png",
    width: 2400,
    height: 1520,
    alt:
      "The same recipe two ways: a 26-page stack printed from the browser, beside one card printed from RecipePrinter.",
  },
};

export const PRINTED_CARDS: Record<string, PrintedCard> = {
  caprese: {
    src: "/images/printed-cards/card-caprese-pasta-salad.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Caprese Pasta Salad",
    template: "Bistro",
    alt: "A Caprese pasta salad recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
  korean: {
    src: "/images/printed-cards/card-korean-beef-bowl.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Korean Beef Bowl",
    template: "Counter",
    alt: "A Korean beef bowl recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
  pesto: {
    src: "/images/printed-cards/card-basil-pesto.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Basil Pesto",
    template: "Keepsake",
    alt: "A basil pesto recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
};
