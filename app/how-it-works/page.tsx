import type { Metadata } from "next";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { AppsIcon, ImageIcon, LinkIcon, TextIcon } from "@/components/icons";
import { FaqSection } from "@/components/seo/FaqSection";
import { OverviewGrid, type OverviewItem } from "@/components/seo/OverviewGrid";
import { FeatureCards, type FeatureCard } from "@/components/seo/FeatureCards";
import { PickerRow } from "@/components/seo/PickerRow";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl, breadcrumbNode, pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "How Recipe Printer Works",
  description:
    "See how RecipePrinter turns recipes from links, screenshots, photos, and text into printable recipe cards, pages, and PDFs.",
  path: "/how-it-works",
});

// Three facts about the machine, not three steps: they were numbered, which
// promised an order the set does not have. Written for someone who cooks, not
// someone who builds websites. The first used to say "structured data", which
// is the true answer to a question nobody asks in those words.
//
// "When a site says no" was a fourth of these and had no photograph to stand
// on, so it lives in the FAQ below, where someone hitting a failed import will
// actually go looking for it.
const POINTS: FeatureCard[] = [
  {
    heading: "The recipe, not the page",
    image: "before-after",
    body:
      "Most recipe sites keep a tidy copy of the recipe for Google to read. RecipePrinter takes that one, so the story, the ads and the comments never come with it.",
  },
  {
    heading: "Sized for paper",
    image: "card-in-box",
    body:
      "Typeset for the size you pick, a 4 by 6 card or a letter page. A long recipe carries on onto the back, with cut lines to trim by.",
  },
  {
    heading: "Made to be cooked from",
    image: "counter-card",
    body:
      "Paper does not lock, dim, or need a clean hand to scroll it. It sits by the hob, takes a splash, and gets written on.",
  },
];

// Questions about the machine, which is what this page is for. Deliberately not
// the ones /faq already answers: no "do I need an account", no "can I make a
// cookbook". These four are asked by someone who has read the steps above and
// wants to know how far to trust them.
const FAQS = [
  {
    question: "How does it tell the recipe from the story?",
    answer:
      "It does not have to. The recipe a site publishes for search engines is separate from the page you read, so the ingredients and the method arrive on their own and the eight paragraphs about a holiday in Tuscany are never part of what came across.",
  },
  {
    question: "Why do some recipe links not import?",
    answer:
      "Three reasons, and RecipePrinter names the one it hit. The site answered with a bot challenge, the post is only visible to someone signed in, or the page never published a recipe in a form anything can read. In all three the recipe still goes in as pasted text or a screenshot.",
  },
  {
    question: "Does it change the recipe?",
    answer:
      "No. Amounts, steps, notes, prep and cook time and servings come across as the source wrote them, and anything it cannot find is left out rather than guessed at. Every line is yours to correct on the card before it prints.",
  },
  {
    question: "What if the recipe only exists as a photo?",
    answer:
      "Upload it. A cookbook page, an old handwritten card, a screenshot of a Reel: RecipePrinter reads the recipe out of the picture. Photos straight off an iPhone are converted on the way in, so a HEIC file needs nothing done to it first.",
  },
];

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "How it works", href: "/how-it-works" },
];

// HowTo came off with the numbering. The three points are not a procedure, and
// schema that says they are is a claim about the page that is not true; the
// landing pages still emit it because their howTo arrays really are steps.
// FAQPage is the one doing the work here, and it is the one Google still shows.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl("/how-it-works")}#webpage`,
      url: absoluteUrl("/how-it-works"),
      name: "How Recipe Printer Works",
      description:
        "See how RecipePrinter turns recipes from links, screenshots, photos, and text into printable recipe cards, pages, and PDFs.",
      inLanguage: "en",
    },
    breadcrumbNode(
      TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) })),
    ),
    {
      "@type": "FAQPage",
      "@id": `${absoluteUrl("/how-it-works")}#faq`,
      mainEntity: FAQS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

// Four ways in, side by side. These carried photographs until the three points
// above took that treatment: two picture grids on one page made everything look
// equally important, and a list of four entry points is a thing to scan, not a
// thing to be shown.
const SOURCES: OverviewItem[] = [
  {
    icon: LinkIcon,
    title: "A recipe link",
    body: "From a recipe site, a food blog, or a supported social post.",
  },
  {
    icon: ImageIcon,
    title: "A photo or screenshot",
    body: "A cookbook page, an old handwritten card, a screenshot of a Reel.",
  },
  {
    icon: TextIcon,
    title: "Pasted text",
    body: "From a message, an email, a document, or a site that will not import.",
  },
  {
    icon: AppsIcon,
    title: "Another app",
    body: "Sign in to CookPilot, or open a Paprika export file.",
  },
];

const RELATED_GUIDES = [
  "print-recipe-from-website",
  "convert-recipe-to-pdf",
  "printable-recipe-card-generator",
  "recipe-binder",
]
  .map((slug) => SEO_LANDING_PAGES.find((page) => page.slug === slug))
  .filter((page): page is NonNullable<typeof page> => Boolean(page));

export default function HowItWorksPage() {
  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" href="/" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <LandingHero
        align="centered"
        h1="From recipe link to printed recipe card"
        lede="RecipePrinter turns recipes from websites, social links, screenshots, photos, and text into printable recipe cards, pages, and PDFs you can cook from and keep."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" label="Start printing for free" />}
      />

      <LandingSection id="points-heading" heading="What happens to a recipe">
        <FeatureCards items={POINTS} />
      </LandingSection>

      <LandingSection id="sources-heading" heading="Start from what you have">
        <OverviewGrid items={SOURCES} columns={4} />
        <PickerRow label="Guides by what you import" pages={RELATED_GUIDES} />
      </LandingSection>

      <LandingSection id="faq-heading" heading="Questions about the import">
        <FaqSection items={FAQS} />
      </LandingSection>

      <LandingClose />
    </LandingFrame>
  );
}
