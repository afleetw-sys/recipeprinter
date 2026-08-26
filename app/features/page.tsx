import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { PageShell, PageHeader, SectionHeading, ClosingAction } from "@/components/PageShell";
import {
  BookIcon,
  CheckIcon,
  LinkIcon,
  ImageIcon,
  TextIcon,
  PrintIcon,
  ClockIcon,
} from "@/components/icons";
import { pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "Recipe Printing Tool for Recipes Worth Keeping",
  description:
    "A recipe printing tool for turning links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and collections.",
  path: "/features",
});

type Feature = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: LinkIcon,
    title: "Print recipes from websites and social links",
    body: "Paste a recipe URL from a food blog, recipe website, Pinterest, Instagram, TikTok, or another supported social post and RecipePrinter turns it into a printable recipe card or page.",
  },
  {
    icon: ImageIcon,
    title: "Print from a photo or screenshot",
    body: "Upload a cookbook page, a handwritten recipe card, a saved image, or a recipe screenshot and turn it into a readable recipe you can print, save, or add to a binder.",
  },
  {
    icon: TextIcon,
    title: "Paste recipe text",
    body: "Have a recipe from a text, email, document, or site that does not import cleanly? Paste the text and RecipePrinter will format it into a printable recipe.",
  },
  {
    icon: CheckIcon,
    title: "Keep the recipe, leave the web page behind",
    body: "RecipePrinter keeps the title, ingredients, instructions, notes, prep time, cook time, servings, and other useful details when available. Ads, pop-ups, comments, and extra page clutter stay off the printed recipe.",
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
  {
    icon: BookIcon,
    title: "Bind a collection into a cookbook",
    body: "Group a set of recipes into chapters, add a cover and a dedication, and RecipePrinter builds a cookbook with an automatic table of contents. Export it print-ready: US Letter to print at home, or full-bleed 8 x 10 to order a bound copy.",
  },
];

const UTILITY_GUIDES = SEO_LANDING_PAGES.filter(
  (page) => page.intent === "Utility SEO",
);

export default function FeaturesPage() {
  return (
    <PageShell crumb="Features" path="/features">
      <PageHeader
        title="A recipe printing tool for recipes worth keeping"
        lede="RecipePrinter turns websites, social links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and batches you can cook from, save, and collect."
      />

      <ul className="grid gap-cp-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="card p-cp-5 flex flex-col gap-cp-3">
            <span className="text-brand-ink">
              <Icon size={22} />
            </span>
            <h2 className="font-extrabold tracking-[-0.02em] text-cp-h2">
              {title}
            </h2>
            <p className="text-ink-soft text-cp-body leading-relaxed">
              {body}
            </p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="printing-guides-heading">
        <SectionHeading id="printing-guides-heading">Choose how you found the recipe</SectionHeading>
        <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
          Start with the way you found the recipe, then turn it into something
          easier to cook from and keep.
        </p>
        <div className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
          {UTILITY_GUIDES.map((page) => (
            <Link
              key={page.slug}
              href={`/${page.slug}`}
              className="card p-cp-4 text-cp-body font-bold text-ink hover:border-line-strong transition-colors"
            >
              {page.title}
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="privacy-heading"
        className="card p-cp-6 bg-brand-50 border-transparent"
      >
        <SectionHeading id="privacy-heading">Built for real kitchens, not web browsers</SectionHeading>
        <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
          RecipePrinter is not a recipe discovery app, meal planner, grocery
          app, or social network. It exists for what happens after you&apos;ve
          found a recipe worth making again and want it somewhere easier to use
          than an open browser tab.
        </p>
        <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
          Printing is free and needs no account. Used without one, nothing is
          stored on our servers: your print queue lives in your browser for the
          current session only. Sign in and a project you save is kept to your
          account, so you can reopen it from another device. Two optional
          one-time purchases exist: premium print themes, and the cookbook
          builder.
        </p>
      </section>

      <ClosingAction />
    </PageShell>
  );
}
