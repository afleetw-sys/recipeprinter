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
import type { ComparisonValue, SeoIconKey, SeoProofKind } from "@/lib/seoLandingPages";

// ─────────────────────────────────────────────────────────────────────────────
// SEO landing-page visual system, clean, modern, and built only from real
// assets: real printed-card photographs and the real product UI. No fabricated
// graphics, no placeholder boxes. The look is restrained and crisp (hairline
// borders, generous whitespace, one teal accent used sparingly, subtle depth),
// so the pages read as intentionally designed rather than auto-generated.
// ─────────────────────────────────────────────────────────────────────────────

/* The step counter is a NUMBER — text — so the clay is in its tint and its
   edge, and the digit stays ink. See docs/color-roles.md. */
const stepCounter = {
  borderColor: "var(--cp-accent-warm)",
  background: "var(--cp-accent-warm-soft)",
  color: "var(--cp-ink)",
} as const;

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
      <div className="overflow-hidden rounded-2xl border border-line bg-card p-1.5">
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
              className="grid h-10 w-10 flex-none place-items-center rounded-full border text-cp-small font-black"
              style={stepCounter}
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

type ProofImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Where the crop sits when the source shape differs from the slot's. */
  objectPosition?: string;
};

/** One slot shape for every feature row, so the rows read as a set: a 3:2
    landscape rectangle at a fixed width. Composed visuals are authored at 3:2
    so nothing is cropped; the photographs are shot portrait and lean on
    `objectPosition` to keep the part that matters inside the frame. */
// Below `lg` the row is one full-width column, so the figure is capped to keep
// the image from going oversized. At `lg` it fills its grid column instead: the
// copy block already spans its column edge to edge, so a narrower image left the
// two halves starting and ending at different places, and centring it only moved
// the mismatch from one side to both.
const PROOF_SLOT = "w-full max-w-[520px] mx-auto lg:max-w-none";
const PROOF_ASPECT = "3 / 2";

/**
 * The real proof visual for each claim kind. Deliberately empty: the
 * photographs and product screenshots don't exist yet, and a feature row whose
 * kind isn't listed here renders as a full-width editorial block instead of a
 * dashed box. A live marketing page is better off showing no visual than one
 * labelled PRODUCT SCREENSHOT — the placeholder was shipping to production on
 * /print-recipe-from-website and /family-recipe-book. Add an entry here and the
 * row picks the two-column layout back up on its own, no page edits.
 */
/** Keyed by proof kind for the default, plus free-form keys a single feature
    row can name directly. Keying only by kind meant two rows asking for the
    same kind — on one page or across two — got the identical picture, which
    reads as one visual repeated rather than two claims. */
const FEATURE_IMAGES: Record<string, ProofImage> = {
  "multi-themes": {
    src: "/images/multi-themes.png",
    width: 2400,
    height: 1520,
    // Authored wider than the 3:2 slot, so about 5% comes off each side. The
    // composition already runs cards off both edges, so the crop takes more of
    // an edge that was cut on purpose rather than breaking a whole card.
    alt:
      "One recipe, Burst Cherry Tomato Basil Chicken Rigatoni, printed as six cards in six different themes and fanned across a blue background. The same title, the same 45 minutes and serves 6, and the same ingredient list appear on every one, each set in a different typeface, border, and colour, with a cream serif version enlarged in front.",
  },
  "counter-card": {
    src: "/images/crowded-counter.jpeg",
    width: 1800,
    height: 1245,
    alt:
      "A printed Buffalo Chicken Bake card lying on a granite counter beside the cooking it belongs to: a board of shredded chicken with two forks in it, a measuring cup of buffalo sauce, a tub of greek yogurt, dijon mustard, three spice jars, and an empty baking dish.",
  },
  "pdf-search": {
    src: "/images/pdf-search.png",
    width: 2400,
    height: 1436,
    // Wider than the 3:2 slot, so about 5% comes off each side. The window's
    // own edges sit just inside that, and the circled search field survives it.
    alt:
      "A saved recipe PDF open in a document viewer, with sesame oil typed into the search field and the viewer reporting it found on 2 pages. Both matches are highlighted in the ingredient list of a Honey Garlic Salmon Stir Fry Noodles card, and a sidebar lists the pages they were found on.",
  },
  "handwritten-card": {
    src: "/images/jackie-card.jpeg",
    width: 1800,
    height: 1350,
    alt:
      "A handwritten recipe card for Peanut Butter Cookies, from Jackie (Nana), lying on a wooden board beside an open floral recipe box. The card is filled in by hand in cursive: cooking time, oven temperature, and an ingredient list running from flour and baking soda down to vanilla.",
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
      "A printed Basil Pesto recipe card standing in an open floral recipe box on a wooden table, its ingredients and three numbered steps facing out, with tabbed dividers labelled Appetizers and Breakfast filed behind it and a brass RECIPES plate on the front of the box.",
  },
  card: {
    src: "/images/cards-on-counter.jpeg",
    width: 1600,
    height: 1200,
    alt:
      "Five printed recipe cards fanned across a wooden counter in different card designs, among them Caprese Pasta Salad, Korean Beef Bowl, Basil Pesto, and Bruschetta, beside an open recipe box of tabbed dividers holding a handwritten card from Jackie.",
  },
  steps: {
    src: "/images/seo-pasted-text.png",
    width: 2400,
    height: 1600,
    alt:
      "A recipe pasted into RecipePrinter as one unbroken run of text, labelled pasted text, beside the finished card it becomes: Brown Butter Banana Bread, 55 minutes, serves 8, with seven ingredients and five numbered steps.",
  },
  "paste-in-app": {
    src: "/images/recipes-fight-back.png",
    width: 2400,
    height: 1436,
    alt:
      "The RecipePrinter app open at recipeprinter.com with the Paste Text tab selected in the Add recipes panel. A Buffalo Chicken Bake recipe has been pasted straight into the recipe text box as plain lines: a title, then greek yogurt, buffalo sauce, dijon mustard, onion and garlic powder, paprika, and shredded cheddar. A hand-drawn circle marks the panel and the Add button below it. The Ready to print panel alongside is still empty.",
  },
  "before-after": {
    src: "/images/print-to-one.png",
    width: 2400,
    height: 1520,
    alt:
      "The same Caprese Pasta Salad recipe two ways. On the left, a stack of blog pages captioned 26 pages, printed from the browser: navigation bars, a star rating, four paragraphs of preamble, a large advertisement slot, and a bulleted discussion of the ingredients. On the right, one RecipePrinter card captioned 1 card, printed from RecipePrinter: the title, 10 minutes, serves 10, a photo of the salad, the ingredients grouped into pasta salad and dressing, and three numbered steps."
  },
};

/**
 * Feature deep-dives as clean editorial rows: a strong heading on the left, body
 * on the right, separated by hairlines. Strong hierarchy and whitespace keep it
 * scannable rather than a wall of text, and it matches how Canva's own feature
 * sections are set (text-led, no decorative imagery).
 *
 * A row with a real proof image sits beside it in two columns, alternating
 * sides; a row without one runs full width at a readable measure.
 */
export function FeatureRows({
  features,
}: {
  features: {
    heading: string;
    body: string;
    proof?: SeoProofKind;
    caption?: string;
    image?: string;
  }[];
}) {
  // Rows sat `cp-7` apart, the same 32px that separates a row's copy from its
  // own image, so the gap between two rows and the gap inside one row were
  // identical and the set read as one undivided block. The vertical rhythm has
  // to land between the two it sits among: wider than the 32px column gap so a
  // row groups with its own image, and still short of the page's 72px gap
  // between sections so three rows read as one section rather than three.
  return (
    <div className="flex flex-col gap-[40px] lg:gap-[56px]">
      {features.map((feature, index) => {
        const image = feature.image
          ? FEATURE_IMAGES[feature.image]
          : feature.proof
            ? FEATURE_IMAGES[feature.proof]
            : undefined;
        const copy = (
          <>
            <h3 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">{feature.heading}</h3>
            <p className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">{feature.body}</p>
          </>
        );

        if (!image) {
          return (
            <div key={feature.heading} className="max-w-[46rem]">
              {copy}
            </div>
          );
        }

        return (
          <div key={feature.heading} className="grid items-center gap-cp-5 lg:grid-cols-2 lg:gap-cp-7">
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>{copy}</div>
            <figure className={`${PROOF_SLOT} ${index % 2 === 1 ? "lg:order-1" : ""}`}>
              <div className="overflow-hidden rounded-2xl border border-line bg-card p-1.5">
                <Image
                  src={image.src}
                  width={image.width}
                  height={image.height}
                  alt={image.alt}
                  sizes="(max-width: 1023px) 92vw, 520px"
                  className="w-full rounded-xl object-cover"
                  style={{ aspectRatio: PROOF_ASPECT, objectPosition: image.objectPosition }}
                />
              </div>
              {feature.caption && (
                <figcaption className="mt-cp-3 text-cp-caption font-semibold text-ink-soft">
                  {feature.caption}
                </figcaption>
              )}
            </figure>
          </div>
        );
      })}
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
            <div className="overflow-hidden rounded-xl border border-line bg-card p-1.5">
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

/**
 * A head-to-head feature table for a competitor comparison page.
 *
 * Tick, dash, or a tick with the terms attached. That is the convention every
 * comparison table uses, and its whole virtue is that nobody has to be taught
 * it. Rows sit in labelled groups, because ten unbroken rows is the shape a
 * reader skims past rather than reads.
 *
 * Our column is one unbroken tinted band from the header to the last row. The
 * group labels sit on it rather than cutting across it: a full-width banded
 * row chopped the column into four disconnected blocks and made the whole
 * thing read as a spreadsheet.
 *
 * One <table> serves two layouts. At `sm` and up it is an ordinary three
 * column table. Below that it restacks into a block per feature, since three
 * columns inside a phone's width wrapped nearly every cell onto its own line.
 * Restacking keeps one DOM, and one copy of the text for a crawler, instead of
 * rendering a mobile duplicate, so the product names move into per-cell labels
 * that only appear once the header row is hidden.
 *
 * The table is worth reading only if the competitor wins the rows it genuinely
 * wins, so those render exactly like ours.
 */
export function ComparisonTable({
  competitor,
  groups,
}: {
  competitor: string;
  groups: {
    title: string;
    rows: { feature: string; us: ComparisonValue; them: ComparisonValue }[];
  }[];
}) {
  // The tint that makes our column a single vertical band. Applied to every
  // cell in the column, including the header and the group-label rows, so it
  // never breaks.
  //
  // Cornflower, not clay. Clay is the system's "this TELLS you something"
  // colour and it carries the paywall and the warnings, so a column of clay
  // ticks reads as a column of cautions — the opposite of what a tick means.
  const ours = "bg-[var(--cp-accent-soft)]";

  const cell = (v: ComparisonValue, mine: boolean) => (
    <td
      className={`px-cp-4 py-cp-4 align-middle max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-cp-4 max-sm:py-cp-1 ${
        mine ? ours : ""
      }`}
    >
      <span className="hidden text-cp-small font-semibold text-ink-soft max-sm:inline">
        {mine ? "RecipePrinter" : competitor}
      </span>
      {v === false ? (
        <span className="inline-flex items-center" title="Not offered">
          <span className="h-px w-4 rounded bg-line-strong" aria-hidden />
          <span className="sr-only">No</span>
        </span>
      ) : (
        <span className="inline-flex items-baseline gap-cp-2">
          <span className="glyph-accent flex-none translate-y-0.5">
            <CheckIcon size={ICON_SIZE.sm} />
          </span>
          <span className="sr-only">Yes</span>
          {typeof v === "string" && (
            <span className="text-cp-small font-medium leading-snug text-ink">{v}</span>
          )}
        </span>
      )}
    </td>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <table className="w-full border-collapse text-left max-sm:block">
        <caption className="sr-only">
          RecipePrinter compared with {competitor}, feature by feature
        </caption>
        <colgroup>
          <col />
          <col className="w-[26%]" />
          <col className="w-[26%]" />
        </colgroup>
        <thead className="max-sm:hidden">
          <tr>
            <th scope="col" className="border-b border-line-strong px-cp-4 pb-cp-3 pt-cp-4" aria-label="Feature" />
            <th
              scope="col"
              className={`${ours} border-b border-line-strong px-cp-4 pb-cp-3 pt-cp-4 text-cp-body font-extrabold tracking-[-0.02em] text-[var(--cp-ink)]`}
            >
              RecipePrinter
            </th>
            <th scope="col" className="border-b border-line-strong px-cp-4 pb-cp-3 pt-cp-4 text-cp-body font-extrabold tracking-[-0.02em] text-ink">
              {competitor}
            </th>
          </tr>
        </thead>
        {groups.map((group, groupIndex) => (
          <tbody key={group.title} className="max-sm:block">
            <tr className="max-sm:block">
              <th
                scope="colgroup"
                className={`px-cp-4 pb-cp-2 text-cp-caption font-bold uppercase tracking-[0.11em] text-ink-soft max-sm:block ${
                  groupIndex === 0 ? "pt-cp-3" : "pt-cp-6"
                }`}
              >
                {group.title}
              </th>
              {/* Empty, but tinted and padded to match, so the band and the
                  row rhythm both continue through the label. */}
              <td className={`${ours} max-sm:hidden`} aria-hidden />
              <td className="max-sm:hidden" aria-hidden />
            </tr>
            {group.rows.map((row) => (
              <tr
                key={row.feature}
                className="border-t border-line max-sm:block max-sm:py-cp-2"
              >
                <th
                  scope="row"
                  className="px-cp-4 py-cp-4 text-cp-body font-medium leading-snug text-ink max-sm:block max-sm:pb-cp-1 max-sm:font-semibold"
                >
                  {row.feature}
                </th>
                {cell(row.us, true)}
                {cell(row.them, false)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
