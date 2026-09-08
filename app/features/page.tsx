import type { Metadata } from "next";
import Link from "next/link";
import {
  AppsIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  CrownIcon,
  ImageIcon,
  LinkIcon,
  PrintIcon,
  SizeIcon,
  SlidersIcon,
  TextIcon,
} from "@/components/icons";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { HeroProductPhoto } from "@/components/seo/LandingVisuals";
import { OverviewGrid, type OverviewItem } from "@/components/seo/OverviewGrid";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl, breadcrumbNode, pageMetadata } from "@/lib/seo";
import { anchorFor, SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "Recipe Printing Tool for Recipes Worth Keeping",
  description:
    "A recipe printing tool for turning links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and collections.",
  path: "/features",
});

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "Features", href: "/features" },
];

// The visible breadcrumb needs its BreadcrumbList to mean anything to a
// crawler, and this page had neither before it moved onto the landing frame.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl("/features")}#webpage`,
      url: absoluteUrl("/features"),
      name: "Recipe Printing Tool for Recipes Worth Keeping",
      description:
        "A recipe printing tool for turning links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and collections.",
      inLanguage: "en",
    },
    breadcrumbNode(
      TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) })),
    ),
  ],
};

const FEATURES: OverviewItem[] = [
  {
    icon: LinkIcon,
    title: "Print recipes from websites and social links",
    body: "Paste a recipe link from a food blog, recipe website, Pinterest, Instagram, TikTok, or another supported social post and RecipePrinter turns it into a printable recipe card or page.",
  },
  {
    icon: ImageIcon,
    title: "Print from a photo or screenshot",
    body: "Upload a cookbook page, old recipe card, saved image, or recipe screenshot and turn it into a readable recipe you can print, save, or add to a binder.",
  },
  {
    icon: TextIcon,
    title: "Paste recipe text",
    body: "Have a recipe from a text, email, document, or site that does not import cleanly? Paste the text and RecipePrinter will format it into a printable recipe.",
  },
  {
    // Moved here from /how-it-works, where it was the one thing that page had
    // to itself and the page almost nothing linked to. Someone with a Paprika
    // library has hundreds of saved recipes and a reason to print them.
    icon: AppsIcon,
    title: "Bring a library from another app",
    body: "Already keep recipes in CookPilot or Paprika? Sign in to CookPilot, or open a Paprika export file, then add what you want straight to your print queue. A Paprika file is read in your browser, so nothing is uploaded.",
  },
  {
    icon: CheckIcon,
    title: "Keep the recipe, leave the web page behind",
    body: "RecipePrinter keeps the title, ingredients, instructions, notes, prep time, cook time, servings, and other useful details when available. Ads, pop-ups, comments, and extra page clutter stay off the printed recipe.",
  },
  {
    icon: SlidersIcon,
    title: "Fix the recipe before it prints",
    body: "The title, ingredients, steps, and notes are editable right on the card. Correct an amount, drop a step you do not need, or add a note of your own, and the change is there when it prints.",
  },
  {
    icon: SizeIcon,
    title: "Sized for the box it's going in",
    body: "Print a 6 by 4 card for a recipe box, or a letter-size page for a binder. Cut lines give you a trim guide on card stock, and a long recipe carries on onto the back of the same card.",
  },
  {
    icon: PrintIcon,
    title: "Create recipe cards, pages, and PDFs",
    body: "Print a recipe card for your kitchen, a letter-size recipe page for your binder, or choose Save as PDF to keep a recipe copy on your device.",
  },
  {
    icon: ClockIcon,
    title: "Print multiple recipes at once",
    body: "Build a print queue from different sources, select the recipes you want, and print the whole batch in one job for a recipe binder, family cookbook, or week of dinners.",
  },
];

// The two things you can pay for, which this page never mentioned. Kept in
// their own section rather than mixed into the grid above: everything up there
// is free and needs no account, and burying a purchase among it would misread
// as the whole page being paid.
const PAID: OverviewItem[] = [
  {
    icon: BookIcon,
    title: "Turn a set of recipes into a cookbook",
    body: "Group recipes into chapters, add a cover, and RecipePrinter builds the table of contents for you. Export a print-ready PDF to print at home in US Letter, or a full-bleed 8 by 10 to order a bound hardcover from a service like Lulu or Blurb. The builder is a one-time purchase for the book you make.",
  },
  {
    icon: CrownIcon,
    title: "Premium print themes",
    body: "A theme changes a card's type, its border, and how the photo sits, without touching the recipe underneath. Several themes are free, and the premium ones are a one-time purchase.",
  },
];

// Between them these two groups cover every landing page, so a page can never
// be added without picking up a link from here. The section used to render the
// "Utility SEO" pages alone, which left the five organizing, preserving, and
// alternative pages reachable from the sitemap and almost nowhere else.
const UTILITY_GUIDES = SEO_LANDING_PAGES.filter(
  (page) => page.intent === "Utility SEO",
);

const KEEPING_GUIDES = SEO_LANDING_PAGES.filter(
  (page) => page.intent !== "Utility SEO",
);

function GuideLinks({ pages }: { pages: typeof SEO_LANDING_PAGES }) {
  return (
    <div className="grid gap-cp-3 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((page) => (
        <Link
          key={page.slug}
          href={`/${page.slug}`}
          className="card p-cp-4 text-cp-body font-bold text-ink hover:border-line-strong transition-colors"
        >
          {anchorFor(page)}
        </Link>
      ))}
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" href="/" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <LandingHero
        h1="A recipe printing tool for recipes worth keeping"
        lede="RecipePrinter turns websites, social links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and batches you can cook from, save, and collect."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" />}
        aside={
          <HeroProductPhoto
            cardKey="korean"
            annotation="Printed from a recipe link"
            priority
            wide
          />
        }
      />

      <LandingSection id="features-heading" heading="What RecipePrinter does">
        <OverviewGrid items={FEATURES} />
      </LandingSection>

      <LandingSection
        id="paid-heading"
        heading="Two things you can buy, once"
        lede="Printing is free and needs no account. These are the only optional purchases, and the price is shown before you buy."
      >
        <OverviewGrid items={PAID} columns={2} />
      </LandingSection>

      <LandingSection
        id="printing-guides-heading"
        heading="Choose how you found the recipe"
        lede="Start with the way you found the recipe, then turn it into something easier to cook from and keep."
      >
        <GuideLinks pages={UTILITY_GUIDES} />
      </LandingSection>

      <LandingSection
        id="keeping-guides-heading"
        heading="Keep them, sort them, pass them on"
        lede="What happens after the printing: where the recipes live, how they stay findable, and how they reach the next person who cooks from them."
      >
        <GuideLinks pages={KEEPING_GUIDES} />
      </LandingSection>

      <section
        aria-labelledby="privacy-heading"
        className="card p-cp-6 border-l-2 border-l-[var(--cp-accent-warm)]"
      >
        <h2
          id="privacy-heading"
          className="font-extrabold tracking-[-0.02em] text-cp-h2"
        >
          Built for real kitchens, not web browsers
        </h2>
        <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
          RecipePrinter is not a recipe discovery app, meal planner, grocery
          app, or social network. It exists for what happens after you&apos;ve
          found a recipe worth making again and want it somewhere easier to use
          than an open browser tab.
        </p>
        <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
          No account required. Print without signing in and your queue lives in
          your browser, not in an account. Sign in only if you want a project
          saved so you can reopen it on another device. Either way, the recipes
          you print, save, and collect stay yours.
        </p>
      </section>

      <div>
        <LandingCta href="/" />
      </div>
    </LandingFrame>
  );
}
