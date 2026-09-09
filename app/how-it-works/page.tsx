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

// The three things that happen to a recipe, in order: where it is taken from,
// what is done to it, and who signs it off. They were a mechanism, a feature
// and a benefit sitting together, which is a strange set to meet under "what
// happens to a recipe" on a page called How it works. "Made to be cooked from"
// is the argument for printing at all, not part of how the printing happens,
// so it belongs on /features rather than here.
//
// Written for someone who cooks. The first one used to say "structured data",
// which is the true answer to a question nobody asks in those words.
const POINTS: FeatureCard[] = [
  {
    heading: "It takes the recipe, not the page",
    image: "before-after",
    body:
      "Most recipe sites keep a tidy copy of the recipe for Google to read. RecipePrinter takes that one, so the story, the ads and the comments never come with it.",
  },
  {
    heading: "It rebuilds it for the paper",
    image: "card-in-box",
    body:
      "Ingredients down one side, method down the other, set for the size you pick. A long recipe prints on the back too, with cut lines to trim by.",
  },
  {
    heading: "Nothing prints until you say so",
    image: "inline-editing",
    body:
      "You see the card before it goes anywhere, and nothing on it is fixed. Change an amount, cut a step, add a note in your own words.",
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
      "The two arrive separately, so there's nothing to sort. Most sites publish the recipe (ingredients and steps only) on its own for search engines to read. Everything else stays on the page where you found it.",
  },
  {
    question: "Why do some recipe links not import?",
    answer:
      "Some sites block anything that isn't a person clicking. Some posts only open when you're signed in. And some pages never publish the recipe anywhere a machine can read it. RecipePrinter says which one it hit, so you can paste the text or upload a screenshot instead.",
  },
  {
    question: "Does it change the recipe?",
    answer:
      "No. It copies rather than rewrites, so amounts, steps, notes and times arrive as the source wrote them. A photo or a video takes more reading than a written page does, and either way you see the finished card before anything prints.",
  },
  {
    question: "What if the recipe only exists as a photo?",
    answer:
      "A picture is enough. A cookbook page, an old handwritten card, a screenshot of a Reel: RecipePrinter reads the recipe out of it. Photos straight off an iPhone work as they are, HEIC and all.",
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
    body: "From a message, an email, a document, or a site that won't import.",
  },
  {
    icon: AppsIcon,
    title: "Another app",
    body: "Sign in to CookPilot, or open a Paprika export file.",
  },
];

// The shelf under "Start from what you have" was pointing at a PDF, recipe
// cards and a binder, which are what you end up with, under a label that says
// what you import. The source pages are the ones that finish that sentence.
const SOURCE_GUIDES = SEO_LANDING_PAGES.filter(
  (page) => page.pickerGroup === "source",
);

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
        <PickerRow label="Guides by what you import" pages={SOURCE_GUIDES} />
      </LandingSection>

      <LandingSection id="faq-heading" heading="Questions about the import">
        <FaqSection items={FAQS} />
      </LandingSection>

      <LandingClose />
    </LandingFrame>
  );
}
