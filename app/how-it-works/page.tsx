import type { Metadata } from "next";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { HowItWorks } from "@/components/seo/LandingVisuals";
import { FaqSection } from "@/components/seo/FaqSection";
import { FeatureCards, type FeatureCard } from "@/components/seo/FeatureCards";
import { PickerRow } from "@/components/seo/PickerRow";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl, breadcrumbNode, howToNode, pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "How Recipe Printer Works",
  description:
    "See how RecipePrinter turns recipes from links, screenshots, photos, and text into printable recipe cards, pages, and PDFs.",
  path: "/how-it-works",
});

// These used to read add a recipe, it becomes printable, print it, which is how
// a printer works rather than how this one does, and says nothing a reader did
// not know before clicking. What is actually worth explaining is the mechanism:
// where the recipe comes from, why the story does not come with it, and what
// happens when a site will not give it up.
const STEPS = [
  {
    name: "It reads the recipe, not the page",
    text: "Most recipe sites publish the recipe as structured data so search engines can show it. That is the first thing RecipePrinter looks for, which is why the story above it, the ads beside it, and the comments below it never come across: they were never part of what it read.",
  },
  {
    name: "When a site will not give it up",
    text: "Some pages answer an automated request with a bot challenge, and some posts are only visible to someone signed in. RecipePrinter says so rather than printing something half-read, and the recipe still goes in as a photo, a screenshot, or pasted text.",
  },
  {
    name: "It is set for paper, not for a screen",
    text: "The recipe is typeset for the size you pick, a 4 by 6 card or a letter page. A recipe too long for one side carries on onto the back, and cut lines give you a trim guide on card stock.",
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

// This is the page on the site most literally about a procedure, and it was the
// only explainer emitting no structured data at all. HowTo rich results are
// largely retired, but the markup still feeds entity understanding and the
// answer engines, which is why the landing template emits it too.
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
    howToNode("How RecipePrinter works", STEPS),
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

// Named like the features cards are named, and each one carries a photograph
// that shows the source it describes rather than a picture of the idea. Three
// of the four appear on /features too, which is fine: these are two pages doing
// different jobs, and the honest picture of pasting text is the honest picture
// of pasting text on either of them.
const SOURCES: FeatureCard[] = [
  {
    heading: "A recipe link",
    image: "before-after",
    body:
      "Paste a link from a recipe website, food blog, or supported social post and RecipePrinter pulls out the recipe, without the ads, the pop-ups, or the story above it.",
  },
  {
    heading: "A photo or a screenshot",
    image: "handwritten-card",
    body:
      "A cookbook page, an old handwritten card, a screenshot of a Reel, a saved image. RecipePrinter reads the recipe out of the picture and sets it for paper.",
  },
  {
    heading: "Pasted text",
    image: "paste-in-app",
    body:
      "A recipe from a message, an email, a document, or a site that does not import cleanly. Paste the text and it comes back as a recipe card or a page.",
  },
  {
    heading: "A library from another app",
    image: "cookpilot-export",
    body:
      "Sign in to CookPilot, or open a Paprika export file, and add what you want to the print queue. A Paprika file is read in your browser, so nothing is uploaded.",
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

      <LandingSection id="steps-heading" heading="What happens to a recipe">
        <HowItWorks steps={STEPS} />
      </LandingSection>

      <LandingSection id="sources-heading" heading="Start from what you have">
        <FeatureCards items={SOURCES} columns={2} />
        <PickerRow label="Guides by what you import" pages={RELATED_GUIDES} />
      </LandingSection>

      <LandingSection id="faq-heading" heading="Questions about the import">
        <FaqSection items={FAQS} />
      </LandingSection>

      <LandingClose />
    </LandingFrame>
  );
}
