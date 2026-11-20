import type { Metadata } from "next";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  SectionHeading,
} from "@/components/seo/LandingFrame";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { GuidePicker } from "@/components/seo/GuidePicker";
import { FaqCards } from "@/components/seo/FaqCards";
import { BookIcon, CheckIcon, CrownIcon, ICON_SIZE } from "@/components/icons";
import { PriceText } from "@/components/PriceText";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { FREE_COOKBOOK_RECIPES } from "@/lib/freeImports";
import { PRO_BENEFITS } from "@/lib/proUpgradeCopy";
import {
  FAQ,
  FAQ_GROUPS,
  absoluteUrl,
  breadcrumbNode,
  faqJsonLd,
  pageMetadata,
  type FaqItem,
} from "@/lib/seo";
import { SEO_LANDING_PAGE_MAP } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "Recipe Printer FAQ",
  description:
    "Answers about printing recipes from websites, URLs, Pinterest, Instagram, TikTok, PDFs, recipe cards, binders, and privacy.",
  path: "/faq",
});

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "FAQ", href: "/faq" },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    // One FAQPage over every question, whatever heading it sits under. The
    // grouping is for the reader; a crawler wants the whole set in one node.
    { ...faqJsonLd(FAQ), "@id": `${absoluteUrl("/faq")}#faq` },
    breadcrumbNode(
      TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) })),
    ),
  ],
};

/** Resolve an answer's `guides` slugs, dropping any that no longer exist. */
function guidePagesFor(slugs: string[] | undefined) {
  return (slugs ?? [])
    .map((slug) => SEO_LANDING_PAGE_MAP.get(slug))
    .filter((page): page is NonNullable<typeof page> => Boolean(page));
}

function Answers({ items }: { items: FaqItem[] }) {
  return (
    // Expandable at any length: each group here is short, but the page is
    // nothing but questions, and sixteen answers laid out flat was a wall.
    <FaqCards
      expandable
      items={items.map(({ question, answer, guides }) => {
        const guidePages = guidePagesFor(guides);
        return {
          question,
          answer,
          footer:
            guidePages.length > 0 ? (
              // The same chips the guide shelves use, rather than bold words
              // in a wrapped row. As text they read as part of the answer and
              // nothing marked them as somewhere to go; five of them under
              // the social question read as a sentence that had lost its
              // punctuation. As controls they are plainly clickable, and they
              // carry the short label, so "Pinterest" rather than "Print
              // Pinterest recipes" inside an answer that just said Pinterest.
              <div className="mt-cp-4 border-t border-line pt-cp-4">
                <p className="mb-cp-3 text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
                  Read more
                </p>
                <GuidePicker pages={guidePages} labelBy="anchor" />
              </div>
            ) : undefined,
        };
      })}
    />
  );
}

/** The question drawn as the side-by-side rather than as a card. Its plain
    answer goes to the JSON-LD with the rest; the cards below say the same
    things, item for item. */
const COMPARE = FAQ.find((item) => item.group === "compare");

/** What one cookbook purchase covers, from lib/useCookbookPurchase.ts and
    computeProLocks's cookbook-mode exemptions. */
const COOKBOOK_POINTS = [
  "One book of your recipes, with a cover, chapters, a table of contents and page numbers",
  "Every theme and Customize theme, inside that book",
  "Add as many recipes as you like, keep editing, and download it again any time",
  `Preview it free with up to ${FREE_COOKBOOK_RECIPES} recipes before you buy`,
];

/** Clears the sticky site header when a jump link lands on a heading. */
const ANCHOR_OFFSET = "scroll-mt-[96px]";

function PointList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-cp-4 flex flex-col gap-cp-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-cp-2 text-cp-body text-ink-soft">
          <CheckIcon size={ICON_SIZE.sm} className="mt-[4px] shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Cookbook or Pro, side by side, before any question. People kept buying
 * one expecting the other (Amelia, 2026-11-19): the difference was there, but
 * only as a paragraph halfway down a list, and the two read as a cheaper and
 * a dearer version of the same thing. Two cards with what each is FOR on top
 * make it a choice between two different jobs.
 */
function WhichDoINeed() {
  if (!COMPARE) return null;
  return (
    <section aria-labelledby="faq-compare" className="mx-auto w-full max-w-[56rem]">
      <div id="faq-compare" className={`${ANCHOR_OFFSET} text-center`}>
        <SectionHeading>{COMPARE.question}</SectionHeading>
      </div>
      <p className="mt-cp-2 text-center text-cp-body leading-relaxed text-ink-soft">
        Printing one full-page recipe at a time is free. These are two separate purchases for
        two different jobs.
      </p>
      <div className="mt-cp-6 grid gap-cp-5 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-line bg-card p-cp-6">
          <div className="flex items-center gap-2">
            <BookIcon size={ICON_SIZE.md} className="text-ink" />
            <h3 className="text-cp-h2 font-extrabold text-ink">A cookbook</h3>
          </div>
          <p className="mt-cp-2 text-cp-body font-bold text-ink">For making one book</p>
          <p className="text-cp-small text-ink-soft">
            <PriceText>{`${COOKBOOK_PRICE_FALLBACK} per cookbook. Each cookbook is its own purchase.`}</PriceText>
          </p>
          <PointList items={COOKBOOK_POINTS} />
        </div>
        <div className="flex flex-col rounded-2xl border border-line bg-[color-mix(in_srgb,var(--cp-premium-soft)_30%,transparent)] p-cp-6">
          <div className="flex items-center gap-2">
            <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
            <h3 className="text-cp-h2 font-extrabold text-ink">RecipePrinter Pro</h3>
          </div>
          <p className="mt-cp-2 text-cp-body font-bold text-ink">For everyday recipe cards</p>
          <p className="text-cp-small text-ink-soft">
            <PriceText>{"$4.99 a month or $39.99 a year. Cancel any time."}</PriceText>
          </p>
          <PointList items={PRO_BENEFITS} />
        </div>
      </div>
      <p className="mt-cp-5 text-center text-cp-body leading-relaxed text-ink-soft">
        They don&apos;t overlap: Pro doesn&apos;t unlock a cookbook, and a cookbook doesn&apos;t add
        Pro to your recipe cards.
      </p>
    </section>
  );
}

const JUMP_LINKS = [
  { href: "#faq-compare", label: "Cookbook or Pro?" },
  ...FAQ_GROUPS.map(({ id, nav }) => ({ href: `#faq-${id}`, label: nav })),
];

/**
 * Where each section starts. A sticky column beside the questions on a wide
 * screen, so it is there wherever the reader has scrolled to; a wrapped row of
 * chips above them on a phone, where there is no room beside.
 */
function JumpList() {
  return (
    <nav aria-label="FAQ sections" className="lg:sticky lg:top-[96px] lg:self-start">
      <p className="mb-cp-3 text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
        Jump to
      </p>
      <ul className="flex flex-wrap gap-cp-2 lg:flex-col lg:gap-cp-1">
        {JUMP_LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="btn btn-secondary btn-compact lg:w-full lg:justify-start"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function FaqPage() {
  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" href="/" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <LandingHero
        align="centered"
        h1="Frequently asked questions"
        lede="Answers about importing recipes, printing cards and PDFs, making cookbooks, and what RecipePrinter Pro adds."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" label="Start printing for free" />}
      />

      <WhichDoINeed />

      <div className="flex flex-col gap-cp-7 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-[56px]">
        <JumpList />
        <div className="flex flex-col gap-[64px] lg:gap-[84px]">
          {FAQ_GROUPS.map(({ id, heading }) => {
            const items = FAQ.filter((item) => item.group === id);
            if (items.length === 0) return null;
            return (
              <section key={id} aria-labelledby={`faq-${id}`}>
                <div id={`faq-${id}`} className={ANCHOR_OFFSET}>
                  <SectionHeading>{heading}</SectionHeading>
                </div>
                <div className="mt-cp-6">
                  <Answers items={items} />
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <LandingClose />
    </LandingFrame>
  );
}
