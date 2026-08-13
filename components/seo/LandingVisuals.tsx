import Image from "next/image";
import { PRINTED_CARDS } from "@/components/seo/ProductMockup";
import {
  BookIcon,
  CheckIcon,
  ClockIcon,
  CrownIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  PrintIcon,
  TextIcon,
  UsersIcon,
} from "@/components/icons";
import type { SeoIconKey, SeoProofKind } from "@/lib/seoLandingPages";

// ─────────────────────────────────────────────────────────────────────────────
// SEO landing-page visual system, clean, modern, and built only from real
// assets: real printed-card photographs and the real product UI. No fabricated
// graphics, no placeholder boxes. The look is restrained and crisp (hairline
// borders, generous whitespace, one teal accent used sparingly, subtle depth),
// so the pages read as intentionally designed rather than auto-generated.
// ─────────────────────────────────────────────────────────────────────────────

const accentInk = { color: "var(--cp-accent-ink)" } as const;

function FileGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

const ICONS: Record<SeoIconKey, (p: { size?: number }) => JSX.Element> = {
  link: LinkIcon,
  image: ImageIcon,
  text: TextIcon,
  print: PrintIcon,
  pdf: FileGlyph,
  book: BookIcon,
  clock: ClockIcon,
  check: CheckIcon,
  users: UsersIcon,
  crown: CrownIcon,
};

/** Reassurances under the hero, as flat outline chips. */
export function ValueRow({ items }: { items: { icon: SeoIconKey; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-cp-2">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? CheckIcon;
        return (
          <li
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-cp-3 py-2 text-cp-small font-semibold text-ink"
          >
            <span style={accentInk} aria-hidden>
              <Icon size={ICON_SIZE.md} />
            </span>
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled placeholder for a real product screenshot to be dropped in later. */
export function Placeholder({
  label = "Product screenshot",
  sublabel,
  aspect = "4 / 3",
  className = "",
}: {
  label?: string;
  sublabel?: string;
  aspect?: string;
  className?: string;
}) {
  return (
    <div
      className={`grid place-items-center rounded-2xl border border-dashed border-line-strong ${className}`}
      style={{ aspectRatio: aspect, background: "var(--cp-page)" }}
    >
      <div className="px-cp-5 text-center">
        <p className="text-cp-caption font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
        {sublabel && <p className="mt-1 text-cp-caption text-ink-soft">{sublabel}</p>}
      </div>
    </div>
  );
}

function proofLabel(proof?: SeoProofKind): string {
  switch (proof) {
    case "before-after":
      return "Cluttered page → clean printable";
    case "card":
      return "A printable 4×6 recipe card";
    case "pdf":
      return "The recipe saved as a PDF";
    case "book":
      return "A page in a bound cookbook";
    case "photo":
      return "Photos on a recipe page";
    case "social":
      return "Importing from a social post";
    case "binder":
      return "Recipe pages in a binder";
    default:
      return "The tool in action";
  }
}

/**
 * A real printed-card photo in a clean modern frame: a soft accent halo for
 * depth, a hairline-bordered image, and one floating pill that ties the photo to
 * the product (e.g. "Printed from a link · 6×4 card"). The photo, an actual card
 * on a real table, is the proof; the frame just presents it well.
 */
export function HeroProductPhoto({
  cardKey = "korean",
  annotation,
  priority = false,
  wide = false,
}: {
  cardKey?: string;
  annotation?: string;
  priority?: boolean;
  wide?: boolean;
}) {
  const card = PRINTED_CARDS[cardKey] ?? PRINTED_CARDS.korean;
  return (
    <div className={`relative mx-auto w-full ${wide ? "max-w-[860px]" : "max-w-[460px]"}`}>
      <div className="overflow-hidden rounded-2xl border border-line bg-white p-1.5">
        <Image
          src={card.src}
          width={card.width}
          height={card.height}
          alt={card.alt}
          sizes="(max-width: 1023px) 90vw, 460px"
          priority={priority}
          className="aspect-[4/3] w-full rounded-xl object-cover [object-position:50%_86%]"
        />
      </div>
      {annotation && (
        <span className="absolute -bottom-3 left-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-cp-3 py-1.5 text-cp-caption font-bold text-ink">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--cp-accent)" }} aria-hidden />
          {annotation}
        </span>
      )}
    </div>
  );
}

/** Numbered steps as a clean, connected row, big accent numerals, hairline spine. */
export function HowItWorks({ steps }: { steps: { name: string; text: string }[] }) {
  return (
    <ol className="grid gap-cp-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.name} className="relative">
          <div className="flex items-center gap-cp-3">
            <span
              className="grid h-10 w-10 flex-none place-items-center rounded-full border border-line bg-card text-cp-small font-black"
              style={accentInk}
            >
              {index + 1}
            </span>
            {index < steps.length - 1 && (
              <span className="hidden h-px flex-1 bg-line lg:block" aria-hidden />
            )}
          </div>
          <h3 className="mt-cp-3 font-bold tracking-[-0.01em]">{step.name}</h3>
          <p className="mt-cp-1 text-ink-soft text-cp-small leading-relaxed">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Feature deep-dives as clean editorial rows: a strong heading on the left, body
 * on the right, separated by hairlines. Strong hierarchy and whitespace keep it
 * scannable rather than a wall of text, and it matches how Canva's own feature
 * sections are set (text-led, no decorative imagery).
 */
export function FeatureRows({
  features,
}: {
  features: { heading: string; body: string; proof?: SeoProofKind }[];
}) {
  return (
    <div className="flex flex-col gap-cp-7">
      {features.map((feature, index) => (
        <div key={feature.heading} className="grid items-center gap-cp-5 lg:grid-cols-2 lg:gap-cp-7">
          <div className={index % 2 === 1 ? "lg:order-2" : ""}>
            <h3 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">{feature.heading}</h3>
            <p className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">{feature.body}</p>
          </div>
          <Placeholder sublabel={proofLabel(feature.proof)} className={index % 2 === 1 ? "lg:order-1" : ""} />
        </div>
      ))}
    </div>
  );
}

/** The photo moment: the real printed cards, presented cleanly with quiet captions. */
export function PhotoGallery({ cardKeys }: { cardKeys: string[] }) {
  const keys = cardKeys.filter((k) => PRINTED_CARDS[k]);
  if (keys.length === 0) return null;
  return (
    <div className="grid gap-cp-5 sm:grid-cols-3">
      {keys.map((key) => {
        const card = PRINTED_CARDS[key];
        return (
          <figure key={key} className="flex flex-col gap-cp-3">
            <div className="overflow-hidden rounded-xl border border-line bg-white p-1.5">
              <Image
                src={card.src}
                width={card.width}
                height={card.height}
                alt={card.alt}
                sizes="(max-width: 640px) 90vw, 380px"
                className="aspect-square w-full rounded-lg object-cover [object-position:50%_88%]"
              />
            </div>
            <figcaption className="text-cp-caption font-semibold text-ink-soft">
              <span className="font-bold text-ink">{card.recipe}</span> · {card.template} layout
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
