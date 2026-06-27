import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { pageMetadata, PUBLISHER } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "Why we built RecipePrinter: a free, no-clutter way to print recipes from the web, " +
    "made by the team behind the CookPilot cooking app.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="About"
        title="Why we made RecipePrinter"
        lede="A free tool for getting a clean, printable recipe out of a web page that buries it under ads and a thousand words of story."
      />

      <div className="flex flex-col gap-cp-5 text-ink-soft leading-relaxed">
  <p>
    If you cook from the internet, you know the routine: a recipe buried beneath ads, autoplay videos, pop-ups, and pages of story before you finally reach the ingredients. Try printing it and you often get all of that on paper too, spread across several wasted pages.
  </p>

  <p>
    <span className="font-semibold text-ink">RecipePrinter fixes that.</span> Paste a recipe URL, upload a photo, paste recipe text, or import directly from CookPilot and we'll turn it into a clean printable recipe card or letter-size page containing just the recipe: title, ingredients, instructions, and notes.
  </p>

  <p>
    Print it for tonight's dinner, save it as a PDF, add it to a recipe binder, share it with family, or collect your favorites into a cookbook over time. RecipePrinter is built for the recipes that make it out of your bookmarks and into your kitchen.
  </p>

  <p>
    No ads, no clutter, no account required, and nothing stored on our servers. Just clean printable recipes that respect your time, your paper, and your printer's ink.
  </p>

  <p>
    RecipePrinter isn't a recipe database, meal planner, or social network. It's built for what happens after you've found a recipe worth making again.
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
