import type { Metadata } from "next";
import type { ComponentType } from "react";
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

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    "Print recipes from web and social URLs, photos, screenshots, and pasted text. RecipePrinter turns recipes into clean printable cards, pages, and PDFs with no ads or clutter.",
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
    title: "Print recipes from web and social URLs",
    body: "Paste a recipe URL from a food blog, recipe website, or supported social post and RecipePrinter turns it into a clean printable recipe card or page without the ads, pop-ups, or extra clutter.",
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
    title: "Remove ads and recipe page clutter",
    body: "RecipePrinter keeps the title, ingredients, instructions, notes, prep time, cook time, servings, and other useful details when available. The rest stays off the page.",
  },
  {
    icon: PrintIcon,
    title: "Create recipe cards, pages, and PDFs",
    body: "Print a recipe card for your kitchen, a letter-size recipe page for your binder, or choose Save as PDF to keep a clean recipe copy on your device.",
  },
  {
    icon: ClockIcon,
    title: "Print multiple recipes at once",
    body: "Build a print queue from different sources, select the recipes you want, and print the whole batch in one job for a recipe binder, family cookbook, or week of dinners.",
  },
];

export default function FeaturesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Everything you need to print recipes worth keeping"
        lede="RecipePrinter turns web and social recipe links, photos, screenshots, and text into clean printable recipe cards, recipe pages, and PDFs you can actually cook from."
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
          print stay yours.
        </p>
      </section>

      <div className="mt-cp-7">
        <StartPrintingCta />
      </div>
    </PageShell>
  );
}
