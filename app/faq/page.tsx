import type { Metadata } from "next";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { GuidePicker } from "@/components/seo/GuidePicker";
import { FaqCards } from "@/components/seo/FaqCards";
import {
  FAQ,
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

// Four runs, in the order someone meets them: how do I get a recipe in, what
// comes out, what does it cost me, and what is this thing. The questions
// themselves are unchanged; only the shelf they sit on is new.
const GROUPS: { id: FaqItem["group"]; heading: string }[] = [
  { id: "getting-in", heading: "Importing recipes" },
  { id: "what-you-get", heading: "Printing and formats" },
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
