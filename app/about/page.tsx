import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About RecipePrinter",
  description:
    "Learn why I built RecipePrinter, a tool for turning recipes from the internet into printable cards, pages, PDFs, and collections worth keeping.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        title="Why I made RecipePrinter"
        lede="A simple tool for turning recipes from the internet into printable recipe cards, pages, PDFs, and collections worth keeping."
      />
      <div className="flex flex-col gap-cp-5 text-ink-soft leading-relaxed">
        <p>
          I built RecipePrinter after building CookPilot, an app for making recipes fit real life.
        </p>

        <p>
          CookPilot solved one half of my problem: it gave me a place to keep
          recipes I wanted to remember.
        </p>

        <p>
          But when I actually wanted to cook, I still found myself printing
          recipes.
        </p>

        <p>
          The internet is where recipes are discovered. The kitchen is where
          they belong.
        </p>

        <p>
          If you cook from the internet, you probably know the routine: a recipe
          saved in one tab, a social post in another, a screenshot in your camera
          roll, and a favorite you can never quite find when you need it. Try
          printing directly from the web and you often get the whole page on
          paper, spread across several wasted pages.
        </p>

        <p>
          <span className="font-semibold text-ink">
            RecipePrinter fixes that.
          </span>{" "}
          Paste a recipe URL from a website, blog, or supported social post,
          upload a screenshot or photo, paste recipe text, or import directly
          from CookPilot and we&apos;ll turn it into a printable recipe card,
          recipe page, or PDF containing the recipe details you need: title,
          ingredients, instructions, notes, and timing when available.
        </p>

        <p>
          Print it for tonight&apos;s dinner, save it as a PDF, add it to a
          recipe binder, share it with family, or collect your favorites into a
          family cookbook over time.
        </p>

        <p>
          Some recipes stay bookmarks. The good ones eventually end up in a
          kitchen drawer with handwritten notes, substitutions, and stains in
          the margins.
        </p>

        <p>
          No account required. Nothing stored on our servers. Just printable
          recipes designed for real kitchens instead of web browsers.
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
          className="text-[0.9rem] font-semibold text-brand-ink hover:underline"
        >
          See how it works →
        </Link>
      </div>
    </PageShell>
  );
}
