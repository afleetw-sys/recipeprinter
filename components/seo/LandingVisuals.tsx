import Image from "next/image";
import { PRINTED_CARDS, PROOF_IMAGES } from "@/components/seo/ProductMockup";
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

// What each placeholder is waiting for, in the words of the shot itself, so the
// gap on the page names the photograph that fills it.
const PROOF_LABELS: Record<SeoProofKind, string> = {
  "before-after": "A cluttered recipe page, and the card printed from it",
  card: "A printed 4×6 card, in the kitchen",
  queue: "Several cards from one print run",
  pdf: "The recipe saved as a PDF",
  social: "A social recipe post, and its printed card",
  video: "A cooking video, and the printed recipe",
  scan: "Taking a photo of a handwritten card",
  photo: "A photo on a printed recipe page",
  binder: "Recipe pages filed in a binder",
  book: "A page inside the bound cookbook",
  "book-home": "Printed at home, and bound",
  devices: "The app open on a laptop and a phone",
  steps: "The importer, in the app",
  deck: "Choosing the size and format, in the app",
  templates: "The template picker, in the app",
};

function proofLabel(proof?: SeoProofKind): string {
  return proof ? PROOF_LABELS[proof] : "The tool in action";
}

/** Photograph or product screenshot — so the shot list reads itself off the page. */
function proofTitle(proof?: SeoProofKind): string {
  return proof === "steps" || proof === "deck" || proof === "templates" || proof === "devices"
    ? "Product screenshot"
    : "Photograph";
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
  tall = false,
}: {
  cardKey?: string;
  annotation?: string;
  priority?: boolean;
  wide?: boolean;
  /** Take a taller crop out of the portrait source, for heroes whose copy
      column carries a dropzone or a paste box rather than a single field.
      Without it the photo is either half the height of the column beside it
      or twice it, depending on which capture mode the page opens on. */
  tall?: boolean;
}) {
  const card = PRINTED_CARDS[cardKey] ?? PRINTED_CARDS.korean;
  return (
    <div className={`relative mx-auto w-full ${wide ? "max-w-[560px]" : "max-w-[460px]"}`}>
      <div className="overflow-hidden rounded-2xl border border-line bg-white p-1.5">
        <Image
          src={card.src}
          width={card.width}
          height={card.height}
          alt={card.alt}
          sizes="(max-width: 1023px) 90vw, 460px"
          priority={priority}
          /* The crops all keep the card whole: in these photos it sits between
             roughly 40% and 81% down the frame, so a shorter window has to be
             positioned higher up, not just cropped in from the same 86%. */
          className={`aspect-[4/3] w-full rounded-xl object-cover [object-position:50%_86%] ${
            tall
              ? "lg:aspect-square lg:[object-position:50%_72%]"
              : "lg:aspect-[16/10] lg:[object-position:50%_70%]"
          }`}
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
 * The proof beside a feature claim: the real asset once it exists, and until
 * then a placeholder naming the shot that belongs there.
 */
function Proof({ proof, className = "" }: { proof?: SeoProofKind; className?: string }) {
  const asset = proof ? PROOF_IMAGES[proof] : undefined;
  // Held a little inside its column rather than filling it edge to edge: the
  // claim is the point, and a proof that matches the text block's weight reads
  // as evidence rather than as the subject.
  return (
    <div className={`mx-auto w-full max-w-[500px] ${className}`}>
      {asset ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white p-1.5">
          <Image
            src={asset.src}
            width={asset.width}
            height={asset.height}
            alt={asset.alt}
            sizes="(max-width: 1023px) 90vw, 500px"
            className="w-full rounded-xl"
          />
        </div>
      ) : (
        <Placeholder label={proofTitle(proof)} sublabel={proofLabel(proof)} />
      )}
    </div>
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
      {/* The claim gets the larger share, and the gutter is the grid gap rather
          than the grid gap plus whatever the capped image left over. */}
      {features.map((feature, index) => (
        <div
          key={feature.heading}
          /* The template flips with the row, not just the order: swapping only
             the order left the text in the narrow column on every second row,
             so the claim was 662px wide going one way and 490 the other. */
          className={`grid items-center gap-cp-5 lg:gap-[48px] ${
            index % 2 === 1
              ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
              : "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
          }`}
        >
          <div className={index % 2 === 1 ? "lg:order-2" : ""}>
            <h3 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">{feature.heading}</h3>
            <p className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">{feature.body}</p>
          </div>
          {/* Capped narrower than its column, so it has to be pushed to the
              OUTER margin: centred, it floated away from the page edge the
              text above and below it lines up with. */}
          <Proof
            proof={feature.proof}
            className={index % 2 === 1 ? "lg:order-1 lg:ml-0 lg:mr-auto" : "lg:ml-auto lg:mr-0"}
          />
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
