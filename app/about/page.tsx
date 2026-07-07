import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About RecipePrinter",
  description:
    "Learn why I built RecipePrinter, a free tool for printing recipes from websites as clean recipe cards and PDFs without ads, clutter, or wasted pages.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="About"
        title="Why I made RecipePrinter"
        lede="A simple tool for turning recipes from websites, screenshots, and text into clean printable recipe cards and PDFs."
      />

      <div className="flex flex-col gap-cp-5 text-ink-soft leading-relaxed">
        <p>
          I built RecipePrinter after building CookPilot, my app for making
          recipes work for real life with substitutions, notes, and adjustments.
        </p>

        <p>
          CookPilot solved one half of my problem: making recipes easier to cook
          from.
        </p>

        <p>
          But when I actually wanted to cook, I still found myself printing
          recipes.
        </p>

        <p>
          If you cook from the internet, you probably know the routine: a recipe
          buried beneath ads, autoplay videos, pop-ups, giant photos, and pages
          of story before you finally reach the ingredients. Try printing it and
          you often get all of that on paper too, spread across several wasted
          pages.
        </p>

        <p>
          <span className="font-semibold text-ink">
            RecipePrinter fixes that.
          </span>{" "}
          Paste a recipe URL, upload a screenshot or photo, paste recipe text,
          or import directly from CookPilot and we&apos;ll turn it into a clean
          printable recipe card, recipe page, or PDF containing just the recipe:
          title, ingredients, instructions, and notes.
        </p>

        <p>
          Print it for tonight&apos;s dinner, save it as a PDF, add it to a
          recipe binder, share it with family, or collect your favorites into a
          family cookbook over time.
        </p>

        <p>
          I noticed that the recipes I cooked most often always seemed to end up
          on paper eventually.
        </p>

        <p>
          No ads. No clutter. No account required. Nothing stored on our
          servers. Just clean printable recipes designed for real kitchens
          instead of web browsers.
        </p>

        <p>
          RecipePrinter isn&apos;t a recipe database, meal planner, grocery app,
          or social network. It exists for what happens after you&apos;ve found
          a recipe worth making again.
        </p>
      </div>

      <div className="mt-cp-7 flex flex-wrap items-center gap-cp-4">
        <StartPrintingCta />

        <Link
          href="/how-it-works"
          className="text-[0.9rem] font-semibold text-brand hover:underline"
        >
          See how it works →
        </Link>
      </div>
    </PageShell>
  );
}
