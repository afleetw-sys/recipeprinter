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
          If you cook from the internet, you know the routine: you find a recipe, then scroll past a
          banner ad, an autoplay video, a newsletter pop-up, and several paragraphs about someone&apos;s
          trip to Italy before you reach the ingredients. Print it and you get all of that on paper,
          too, spread across five wasted pages.
        </p>
        <p>
          <span className="font-semibold text-ink">RecipePrinter fixes that.</span> Paste a recipe
          URL, upload a photo, or paste recipe text, and we pull out just the recipe (title,
          ingredients, and steps) and lay it out as a clean, letter-size page you can print or save
          as a PDF. No ads, no clutter, no account, and nothing saved to a server.
        </p>
        <p>
          It&apos;s built by the team behind{" "}
          <a
            href={PUBLISHER.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline font-semibold"
          >
            CookPilot
          </a>
          , a cooking app for saving, organizing, and cooking from your recipes. RecipePrinter is the
          companion for the simplest job of all: getting a recipe off the screen and onto paper. If
          you already use CookPilot, you can pull your saved recipes straight into your print queue.
        </p>
        <p>
          We keep it deliberately small. RecipePrinter isn&apos;t a recipe database or a social
          network. It&apos;s a focused utility that respects your time and your printer&apos;s ink.
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
