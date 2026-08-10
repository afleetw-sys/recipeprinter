import Image from "next/image";

// ─────────────────────────────────────────────────────────────────────────────
// SEO landing-page visuals, real printed recipe cards.
//
// These are photographs of actual cards printed from RecipePrinter, sitting on a
// real table in real light. Nothing here is fabricated or greeked: the whole
// point is that a real printed card is the thing that sells the product, and no
// mockup can fake it. Presentation stays deliberately restrained, good sizing,
// a soft shadow, real breathing room, and lets the photos carry it.
//
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

/**
 * One real printed-card photo, framed cleanly. The source shots are tall
 * portraits with the card sitting in the lower third under a houseplant; we
 * crop to a landscape window low in the frame so the card itself, which is a
 * 6x4 landscape card anyway, is the subject, with just a hint of the sunny
 * table setting behind it for warmth.
 */
function CardPhoto({
  card,
  className = "",
  sizes = "(max-width: 640px) 88vw, 440px",
  priority = false,
}: {
  card: PrintedCard;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`aspect-[4/3] overflow-hidden rounded-2xl shadow-cp-xl ${className}`}
    >
      <Image
        src={card.src}
        width={card.width}
        height={card.height}
        alt={card.alt}
        sizes={sizes}
        priority={priority}
        className="h-full w-full object-cover [object-position:50%_86%]"
      />
    </div>
  );
}

export type HeroVariant =
  | "transform"
  | "pdf"
  | "social"
  | "binder"
  | "keepsake"
  | "templates";

// Which real card photo a landing page leads with, by intent, so no two open
// the same way.
const VARIANT_CARD: Record<HeroVariant, string> = {
  templates: "caprese",
  binder: "korean",
  transform: "korean",
  pdf: "caprese",
  social: "caprese",
  keepsake: "pesto",
};

/** The hero photo for a landing page, one real printed card, by intent. */
export function LandingHeroVisual({ variant }: { variant: HeroVariant }) {
  const card = PRINTED_CARDS[VARIANT_CARD[variant]] ?? PRINTED_CARDS.korean;
  return <CardPhoto card={card} priority sizes="(max-width: 1023px) 90vw, 440px" />;
}
