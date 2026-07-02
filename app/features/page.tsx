import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import {
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
    body: "Upload a cookbook page, old recipe card, saved image, or recipe screenshot and turn it into a readable recipe you can print, save, or add to a binder.",
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
];

const UTILITY_GUIDES = SEO_LANDING_PAGES.filter(
  (page) => page.intent === "Utility SEO",
);

export default function FeaturesPage() {
  return (
    <PageShell>
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
            <h2 className="font-extrabold tracking-[-0.02em] text-[1.05rem]">
              {title}
            </h2>
            <p className="text-ink-soft text-[0.92rem] leading-relaxed">
              {body}
            </p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="printing-guides-heading" className="mt-cp-7">
        <h2
          id="printing-guides-heading"
          className="font-extrabold tracking-[-0.02em] text-[1.1rem]"
        >
          Choose how you found the recipe
        </h2>
        <p className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">
          Start with the way you found the recipe, then turn it into something
          easier to cook from and keep.
        </p>
        <div className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
          {UTILITY_GUIDES.map((page) => (
            <Link
              key={page.slug}
              href={`/${page.slug}`}
              className="card p-cp-4 text-[0.92rem] font-bold text-ink hover:border-line-strong transition-colors"
            >
              {page.title}
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="privacy-heading"
        className="mt-cp-7 card p-cp-6 bg-brand-50 border-transparent"
      >
        <h2
          id="privacy-heading"
          className="font-extrabold tracking-[-0.02em] text-[1.1rem]"
        >
          Built for real kitchens, not web browsers
        </h2>
        <p className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">
          RecipePrinter is not a recipe discovery app, meal planner, grocery
          app, or social network. It exists for what happens after you&apos;ve
          found a recipe worth making again and want it somewhere easier to use
          than an open browser tab.
        </p>
        <p className="mt-cp-3 text-ink-soft text-[0.95rem] leading-relaxed">
          No account required. Nothing saved to our servers. Your print queue
          lives in your browser for the current session only, so the recipes you
          print, save, and collect stay yours.
        </p>
      </section>

      <div className="mt-cp-7">
        <StartPrintingCta />
      </div>
    </PageShell>
  );
}
