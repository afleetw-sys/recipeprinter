import type { Metadata } from "next";
import Link from "next/link";
import {
  AppsIcon,
  ImageIcon,
  LinkIcon,
  TextIcon,
} from "@/components/icons";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { HeroProductPhoto, HowItWorks } from "@/components/seo/LandingVisuals";
import { OverviewGrid, type OverviewItem } from "@/components/seo/OverviewGrid";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl, breadcrumbNode, howToNode, pageMetadata } from "@/lib/seo";
import { anchorFor, SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

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
    text: "Preview it as a 6 by 4 card or a letter-size page, then print. Save as PDF keeps a copy on your device, and a queue of recipes prints in one job.",
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

const SOURCES: OverviewItem[] = [
  {
    icon: LinkIcon,
    title: "Paste a recipe link",
    body: "Paste a link from a recipe website, food blog, or supported social post and RecipePrinter pulls out the recipe so you can print it without the ads, pop-ups, or extra pages.",
  },
  {
    icon: ImageIcon,
    title: "Upload a photo or screenshot",
    body: "Use a cookbook page, old recipe card, screenshot, or saved image. RecipePrinter reads the recipe and turns it into something clean you can print.",
  },
  {
    icon: TextIcon,
    title: "Paste recipe text",
    body: "Have a recipe from a message, email, document, or a site that does not import cleanly? Paste the text and RecipePrinter will format it into a printable recipe card or page.",
  },
  {
    icon: AppsIcon,
    title: "Bring a library from another app",
    body: "Already keep recipes in CookPilot or Paprika? Sign in to CookPilot, or open a Paprika export file, then add what you want straight to your print queue. A Paprika file is read in your browser, so nothing is uploaded.",
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
        h1="From recipe link to printed recipe card"
        lede="RecipePrinter turns recipes from websites, social links, screenshots, photos, and text into printable recipe cards, pages, and PDFs you can cook from and keep."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" />}
        note="Printing is free and needs no account. Your queue lives in your browser. Sign in only if you want a project saved to reopen on another device."
        aside={
          <HeroProductPhoto
            cardKey="pesto"
            annotation="Printed from a recipe link"
            priority
            wide
          />
        }
      />

      <LandingSection id="steps-heading" heading="Three steps">
        <HowItWorks steps={STEPS} />
      </LandingSection>

      <LandingSection
        id="sources-heading"
        heading="Where the recipe can come from"
        lede="RecipePrinter begins after discovery, when a recipe has earned a place on paper, in your kitchen, or in your collection."
      >
        <OverviewGrid items={SOURCES} />
      </LandingSection>

      <LandingSection
        id="related-guides-heading"
        heading="More ways to use RecipePrinter"
      >
        <div className="grid gap-cp-3 sm:grid-cols-2 lg:grid-cols-3">
          {RELATED_GUIDES.map((page) => (
            <Link
              key={page.slug}
              href={`/${page.slug}`}
              className="card p-cp-4 text-cp-body font-bold text-ink hover:border-line-strong transition-colors"
            >
              {anchorFor(page)}
            </Link>
          ))}
        </div>
      </LandingSection>

      <div>
        <LandingCta href="/" />
      </div>
    </LandingFrame>
  );
}
