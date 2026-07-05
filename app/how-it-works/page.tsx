import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import {
  LinkIcon,
  ImageIcon,
  TextIcon,
  CookPilotLogoIcon,
} from "@/components/icons";
import { pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "How Recipe Printer Works",
  description:
    "See how Recipe Printer turns recipes from links, screenshots, photos, and text into printable recipe cards, pages, and PDFs.",
  path: "/how-it-works",
});

type Source = { 
  icon: ComponentType<{ size?: number }>;
  label: string;
  body: string;
};

const SOURCES: Source[] = [
  {
    icon: LinkIcon,
    label: "Paste a recipe URL",
    body: "Paste a link from a recipe website, food blog, or supported social post and RecipePrinter pulls out the recipe so you can print it without the ads, pop-ups, or extra pages.",
  },
  {
    icon: ImageIcon,
    label: "Upload a photo or screenshot",
    body: "Use a cookbook page, old recipe card, screenshot, or saved image. RecipePrinter reads the recipe and turns it into something clean you can print.",
  },
  {
    icon: TextIcon,
    label: "Paste recipe text",
    body: "Have a recipe from a message, email, document, or site we do not recognize? Paste the text and RecipePrinter will format it into a printable recipe card or page.",
  },
  {
    icon: CookPilotLogoIcon,
    label: "Import from CookPilot",
    body: "Already use CookPilot? Bring your saved recipes into RecipePrinter and add them straight to your print queue.",
  },
];

const RELATED_GUIDES = [
  "print-recipe-from-website",
  "print-recipe-from-url",
  "convert-recipe-to-pdf",
  "printable-recipe-card-generator",
  "recipe-binder",
]
  .map((slug) => SEO_LANDING_PAGES.find((page) => page.slug === slug))
  .filter((page): page is NonNullable<typeof page> => Boolean(page));

export default function HowItWorksPage() {
  return (
    <PageShell>
      <PageHeader
        title="From recipe link to printed recipe card"
        lede="RecipePrinter turns recipes from websites, social links, screenshots, photos, and text into printable recipe cards, pages, and PDFs you can cook from and keep."
      />

      <div className="flex flex-col gap-cp-7">
        <section aria-labelledby="step-1">
          <h2
            id="step-1"
            className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
          >
            1. Add a recipe link, photo, screenshot, or text
          </h2>

          <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            Start with a recipe you already want to keep. RecipePrinter begins
            after discovery: when a recipe has earned a place on paper, in your
            kitchen, or in your collection.
          </p>

          <ul className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
            {SOURCES.map(({ icon: Icon, label, body }) => (
              <li key={label} className="card p-cp-5 flex gap-cp-4">
                <span className="text-brand-ink shrink-0 mt-[2px]">
                  <Icon size={20} />
                </span>

                <div>
                  <h3 className="font-bold text-cp-h2">{label}</h3>
                  <p className="mt-cp-1 text-ink-soft text-cp-body leading-relaxed">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="step-2">
          <h2
            id="step-2"
            className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
          >
            2. Turn the recipe into a printable card or page
          </h2>

          <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            Recipe websites and social posts are made for screens, not kitchen
            counters. RecipePrinter keeps the useful recipe details and formats
            them into something readable on paper.
          </p>

          <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            You get a printable recipe with the title, ingredients,
            instructions, notes, prep time, cook time, servings, and other
            useful details when they&apos;re available.
          </p>
        </section>

        <section aria-labelledby="step-3">
          <h2
            id="step-3"
            className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
          >
            3. Print it, save it as a PDF, or add it to your binder
          </h2>

          <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            Preview your recipe as a clean printable recipe card or letter-size
            recipe page, then send it to your printer. You can also choose{" "}
            <span className="font-semibold text-ink">Save as PDF</span> in the
            print dialog to keep a clean recipe PDF on your device.
          </p>

          <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            Printing several recipes? Add them to your print queue and print the
            whole batch at once. It works well for a recipe binder, a week of
            dinners, a family cookbook, or the recipes you keep coming back to.
          </p>

          <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            No account required. Nothing saved to our servers. Just printable
            recipes designed for real kitchens instead of open browser tabs.
          </p>
        </section>

        <section aria-labelledby="related-guides-heading">
          <h2
            id="related-guides-heading"
            className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
          >
            More ways to use RecipePrinter
          </h2>

          <div className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
            {RELATED_GUIDES.map((page) => (
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

        <div className="pt-cp-2">
          <StartPrintingCta />
        </div>
      </div>
    </PageShell>
  );
}
