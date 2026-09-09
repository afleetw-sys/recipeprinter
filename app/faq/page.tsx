import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";
import {
  FAQ,
  absoluteUrl,
  breadcrumbNode,
  faqJsonLd,
  pageMetadata,
  type FaqItem,
} from "@/lib/seo";
import { anchorFor, SEO_LANDING_PAGE_MAP } from "@/lib/seoLandingPages";

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

// Four runs, in the order someone meets them: how do I get a recipe in, what
// comes out, what does it cost me, and what is this thing. The questions
// themselves are unchanged; only the shelf they sit on is new.
const GROUPS: { id: FaqItem["group"]; heading: string }[] = [
  { id: "getting-in", heading: "Getting a recipe in" },
  { id: "what-you-get", heading: "What you get out" },
  { id: "account", heading: "Accounts, privacy and cost" },
  { id: "what-this-is", heading: "What RecipePrinter is" },
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
    // Native <details>, so this needs no client component and no JavaScript,
    // and the answers sit in the DOM whether or not anyone opens one: a crawler
    // and a screen reader both still read them. Sixteen answers laid out flat
    // was a wall; sixteen questions is a list you can run your eye down.
    //
    // Not a <dl>. A definition list cannot have a <details> sitting between its
    // <dt> and <dd>, and the question/answer pairing a crawler needs is carried
    // by the FAQPage node above rather than by these tags.
    <div className="flex flex-col">
      {items.map(({ question, answer, guides }) => {
        const guidePages = guidePagesFor(guides);
        return (
          <details key={question} className="border-t border-line">
            <summary className="cp-faq-summary flex items-start justify-between gap-cp-4 py-cp-4">
              <h3 className="text-cp-body-lg font-extrabold leading-snug tracking-[-0.02em]">
                {question}
              </h3>
              <ChevronDownIcon
                size={ICON_SIZE.sm}
                className="cp-disclosure-caret mt-1"
                aria-hidden
              />
            </summary>
            <div className="pb-cp-5 pr-cp-7 text-ink-soft text-cp-body leading-relaxed">
              {answer}
              {guidePages.length > 0 && (
                <span className="mt-cp-3 flex flex-wrap gap-x-cp-4 gap-y-cp-2">
                  {guidePages.map((page) => (
                    <Link
                      key={page.slug}
                      href={`/${page.slug}`}
                      className="font-bold text-ink hover:underline"
                    >
                      {anchorFor(page)}
                    </Link>
                  ))}
                </span>
              )}
            </div>
          </details>
        );
      })}
    </div>
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
        lede="Answers about printing recipes from websites, URLs, social posts, screenshots, photos, and text as printable cards, pages, and PDFs."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" label="Start printing for free" />}
      />

      {GROUPS.map(({ id, heading }) => {
        const items = FAQ.filter((item) => item.group === id);
        if (items.length === 0) return null;
        return (
          <LandingSection key={id} id={`faq-${id}`} heading={heading}>
            <Answers items={items} />
          </LandingSection>
        );
      })}

      <LandingClose />
    </LandingFrame>
  );
}
