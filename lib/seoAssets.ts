/**
 * The SEO pages' image tables and the shapes they use, as data.
 *
 * Split out of components/seo/LandingVisuals and FeatureCards,
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
  objectPosition?: string;
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
  "buffalo-chicken": {
    src: "/images/printed-cards/buffalo-chicken.jpeg",
    width: 1333,
    height: 2000,
    alt: "A printed Buffalo Chicken Bake card with a blue checkered edge on a yellow surface.",
    objectPosition: "50% 50%",
  },
  souvlaki: {
    src: "/images/printed-cards/souvlaki.jpeg",
    width: 2000,
    height: 1500,
    alt: "A printed Chicken Tzatziki Bowls recipe on a garden table beside the finished bowl.",
  },
  crunchwrap: {
    src: "/images/printed-cards/crunchwrap.jpeg",
    width: 3024,
    height: 4032,
    alt: "A printed Crunchwrap Supreme recipe card beside the finished crunchwrap.",
    objectPosition: "50% 100%",
  },
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
  "photo-recipe-card": {
    src: "/images/peanut-butter-blossoms-card.jpeg",
    width: 2939,
    height: 3919,
    alt:
      "A printed Peanut Butter Blossoms recipe card lying on a vintage yellow spice chart.",
    objectPosition: "50% 58%",
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
  "convert-to-pdf": {
    src: "/images/pdf.png",
    width: 1108,
    height: 1384,
    // A transparent file object, placed loose in the converter's opener rather
    // than inside HeroProductPhoto's framed photography treatment.
    alt:
      "A Honey Garlic Salmon Stir Fry Noodles recipe saved as a PDF file.",
  },
  "paprika-import": {
    src: "/images/paprika.png",
    width: 6350,
    height: 3800,
    alt:
      "A Paprika recipe export opened in RecipePrinter, showing two imported recipes ready to select and print.",
  },
  "multi-recipes": {
    src: "/images/multi-recipes.png",
    width: 5555,
    height: 3800,
    alt:
      "One saved PDF holding several printed recipes, a page each, open in a document viewer with the page thumbnails down the side.",
  },
  sources: {
    src: "/images/sources.png",
    width: 6350,
    height: 3800,
    alt:
      "RecipePrinter's add-recipe panel with its four sources circled: a recipe link, a recipe app, an image, or pasted text.",
  },
  "tiktok-import": {
    src: "/images/tiktok.png",
    width: 6350,
    height: 3800,
    alt: "A TikTok recipe brought into RecipePrinter for editing and printing.",
  },
  "youtube-import": {
    src: "/images/youtube.png",
    width: 6350,
    height: 3800,
    alt: "A YouTube recipe brought into RecipePrinter for editing and printing.",
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
  "printed-cookbook": {
    src: "/images/printed-cards/cookbook.jpeg",
    width: 1333,
    height: 2000,
    alt:
      "A finished spiral-bound cookbook open to a Greek chicken souvlaki recipe and full-page food photograph.",
    objectPosition: "50% 62%",
  },
  "cookbook-cover": {
    src: "/images/cookbook-printed-cover.jpg",
    width: 900,
    height: 1161,
    // Portrait in a 3:2 slot: the centre band keeps the title plate, which is
    // the part that shows the cover was made for one family.
    alt:
      "A printed spiral-bound cookbook cover titled Our Family Cookbook, set over a grid of home-cooked dishes.",
    objectPosition: "50% 50%",
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
    width: 2400,
    height: 1436,
    alt:
      "The same recipe printed twice, with and without its photo, switched by a single toggle.",
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
  "caprese-card-board": {
    src: "/images/printed-cards/caprese-salad.jpeg",
    width: 2000,
    height: 1500,
    alt: "A printed 4×6 Caprese Pasta Salad recipe card on a wooden board beside two wooden spoons.",
  },
  // The "after" of `before-after`, on its own: the card that the 26-page
  // caprese printout became. The same photo as PRINTED_CARDS.caprese, cropped
  // for a 3:2 feature row: the card spans about 37-75% of the frame's height,
  // so 60% centres it (the 86% the card heroes use cuts off its title).
  "caprese-card": {
    src: "/images/card-caprese-pasta-salad.jpeg",
    width: 1200,
    height: 1600,
    alt: "The Caprese pasta salad recipe printed with RecipePrinter as a single card, on a wooden board beside basil and cherry tomatoes.",
    objectPosition: "50% 60%",
  },
};

export const PRINTED_CARDS: Record<string, PrintedCard> = {
  "hot-honey": {
    src: "/images/printed-cards/hot-honey.jpeg",
    objectPosition: "50% 59%",
    width: 1333,
    height: 2000,
    recipe: "Hot Honey Chicken Power Bowl",
    template: "Market",
    alt: "A printed 4×6 Hot Honey Chicken Power Bowl card in the Market theme, with a row of cut-paper groceries along its foot, on a blue cloth.",
  },
  "quilt-noodles": {
    src: "/images/printed-cards/soy-sauce.jpeg",
    objectPosition: "50% 70%",
    width: 1333,
    height: 2000,
    recipe: "Soy Sauce Pan-fried Noodles",
    template: "Quilt",
    alt: "A printed 4×6 Soy Sauce Pan-fried Noodles card in the Quilt theme, with its strip of green and rust tiles, on a green cloth beside dry noodles.",
  },
  "pb-blossoms": {
    src: "/images/printed-cards/pb-blossoms.jpeg",
    objectPosition: "50% 90%",
    width: 1500,
    height: 2000,
    recipe: "Peanut Butter Blossoms",
    template: "Typewriter",
    alt: "A printed 4×6 Peanut Butter Blossoms card in the Typewriter theme, lying on a vintage yellow spice chart.",
  },
  caprese: {
    src: "/images/card-caprese-pasta-salad.jpeg",
    width: 1200,
    height: 1600,
    recipe: "Caprese Pasta Salad",
    template: "Classic",
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
    template: "Pantry",
    alt: "A basil pesto recipe card printed with RecipePrinter, standing on a sunny outdoor table.",
  },
};
