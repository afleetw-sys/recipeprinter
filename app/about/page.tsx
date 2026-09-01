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
  title="About RecipePrinter"
  lede="RecipePrinter started with a simple frustration: printing recipes from the internet was still a terrible experience."
/>

      <div className="flex justify-center">
<div className="my-cp-6 h-px w-full bg-slate-200" />
      </div>
      
      <div className="flex flex-col gap-cp-5 text-ink-soft leading-relaxed">
        <p>
          I built RecipePrinter after building CookPilot, a recipe app for
          saving and organizing recipes.
        </p>

        <p>CookPilot solved one half of my problem.</p>

        <p>
          It gave me a place to keep recipes I wanted to remember.
        </p>

        <p>
          But when I actually wanted to cook, I still found myself printing
          recipes.
        </p>

        <p>
          Not every recipe deserves a place in a binder or kitchen drawer, but
          the good ones eventually get there anyway. They&apos;re the meals you
          make over and over, the recipes your family asks for by name, and the
          dishes that slowly collect notes, substitutions, and stains in the
          margins.
        </p>

        <p>
          The problem was that printing recipes from the internet was still
          awful.
        </p>

        <p>
          Recipe websites are designed for browsers, not printers. You end up
          with ads, pop-ups, giant photos, and five-page printouts when all you
          really wanted was the ingredients and instructions.
        </p>

        <p>So I built RecipePrinter.</p>

        <p>
          Paste a recipe link, upload a screenshot or photo, paste recipe text, or
          bring over a library you already keep in CookPilot or Paprika, and
          RecipePrinter turns it into a clean printable recipe card or PDF
          designed for real kitchens.
        </p>

        <p>
          You can print recipes from websites, save recipes as PDFs, organize a
          recipe binder, build a family cookbook, or simply keep your favorites
          somewhere easier to use than an open browser tab.
        </p>

        <p>No ads. No clutter. No wasted paper. Just the recipe.</p>

        <p>CookPilot helps people collect recipes.</p>

        <p>
          RecipePrinter exists for the recipes that have earned a place outside
          the screen.
        </p>
      </div>

      <div className="mt-cp-7 flex flex-wrap items-center gap-cp-4">
        <StartPrintingCta />

        <Link
          href="/how-it-works"
          className="text-cp-small font-semibold text-brand-ink hover:underline"
        >
          See how it works →
        </Link>
      </div>
    </PageShell>
  );
}
