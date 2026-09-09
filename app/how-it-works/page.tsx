import type { Metadata } from "next";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { HowItWorks } from "@/components/seo/LandingVisuals";
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

// The three steps run through the shared HowItWorks strip, the same component
// every landing page's "How it works" section uses, so the one page on the site
// that is entirely about the steps is drawn the same way as the pages that
// mention them in passing.
const STEPS = [
  {
    name: "Add a recipe",
    text: "Start with a recipe you already want to keep: a link, a photo, a screenshot, pasted text, or a library from another app.",
  },
  {
    name: "It becomes a printable recipe",
    text: "The title, ingredients, instructions, notes, prep time, cook time, and servings are laid out for paper. Ads, pop-ups, and page clutter stay off.",
  },
  {
    name: "Print it, or save the PDF",
    text: "Preview it as a 4 by 6 card or a letter-size page, then print. Save as PDF keeps a copy on your device, and a queue of recipes prints in one job.",
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

      <LandingSection id="steps-heading" heading="Three steps">
        <HowItWorks steps={STEPS} />
      </LandingSection>

      <LandingSection id="sources-heading" heading="Start from what you have">
        <FeatureCards items={SOURCES} columns={2} />
        <PickerRow label="Guides by what you import" pages={RELATED_GUIDES} />
      </LandingSection>

      <LandingClose />
    </LandingFrame>
  );
}
