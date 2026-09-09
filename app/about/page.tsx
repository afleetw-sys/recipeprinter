import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl, breadcrumbNode, organizationNode, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About RecipePrinter",
  description:
    "Learn why I built RecipePrinter, a free tool for printing recipes from websites as clean recipe cards and PDFs without ads, clutter, or wasted pages.",
  path: "/about",
});

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
];

/**
 * An AboutPage node with the Organization behind it, which this page carried
 * none of.
 *
 * Organization, WebSite and WebApplication were emitted on the homepage alone,
 * so the one page that says who makes this and why said nothing a crawler could
 * read. `sameAs` comes off SOCIAL_PROFILES through organizationNode, which is
 * how a search engine ties this site to a brand it already knows about.
 *
 * No Person node. The page is written in the first person and naming whoever
 * that is on the public site is not a decision this file gets to make.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "@id": `${absoluteUrl("/about")}#webpage`,
      url: absoluteUrl("/about"),
      name: "About RecipePrinter",
      description:
        "Why RecipePrinter exists: a free tool for printing recipes from websites as clean recipe cards and PDFs.",
      inLanguage: "en",
    },
    organizationNode(),
    breadcrumbNode(
      TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) })),
    ),
  ],
};

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[46rem] flex-col gap-cp-4 text-ink-soft text-cp-body-lg leading-relaxed">
      {children}
    </div>
  );
}

export default function AboutPage() {
  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" href="/" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <LandingHero
        align="centered"
        h1="About RecipePrinter"
        lede="Printing a recipe off the internet should take one click and one sheet of paper. For years it took neither."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" label="Start printing for free" />}
      />

      {/* The page was one unbroken column of short paragraphs with no headings
          at all, so there was nothing to skim and nothing telling a reader or a
          crawler what any part of it was about. Same story, three chapters. */}
      <LandingSection id="why-heading" heading="Why this exists">
        <Prose>
          <p>
            I built RecipePrinter after building CookPilot, a recipe app for saving
            and organizing recipes. CookPilot solved one half of the problem: it
            gave me somewhere to keep the recipes I wanted to remember.
          </p>
          <p>
            The other half turned up every time I actually cooked. Not every recipe
            deserves a place in a binder or a kitchen drawer, but the good ones end
            up there anyway. They&apos;re the meals you make over and over, the ones
            your family asks for by name, the ones that slowly collect notes,
            substitutions and stains in the margins.
          </p>
          <p>
            And printing them was still awful. Recipe websites are built for
            browsers, not for printers: you ask for a recipe and get ads, pop-ups,
            a photograph the size of a poster, and five sheets of paper for
            something that needed one.
          </p>
        </Prose>
      </LandingSection>

      <LandingSection id="what-heading" heading="What it does about it">
        <Prose>
          <p>
            Paste a recipe link, upload a screenshot or a photo, paste the text, or
            bring over a library you already keep in CookPilot or Paprika.
            RecipePrinter turns any of it into a clean printable recipe card or PDF,
            set for a real kitchen rather than a browser window.
          </p>
          <p>
            From there it is yours: print from a website, save recipes as PDFs,
            fill a{" "}
            <Link href="/recipe-binder" className="font-bold text-ink hover:underline">
              recipe binder
            </Link>
            , build a{" "}
            <Link href="/family-recipe-book" className="font-bold text-ink hover:underline">
              family cookbook
            </Link>
            , or just keep the ones you cook somewhere easier to reach than an open
            tab. No ads, no clutter, no wasted paper.
          </p>
        </Prose>
      </LandingSection>

      <LandingSection id="cookpilot-heading" heading="RecipePrinter and CookPilot">
        <Prose>
          <p>
            They are two halves of the same habit. CookPilot is for collecting
            recipes and making them work in real life: substitutions, notes,
            adjustments. RecipePrinter is for the ones that have earned a place off
            the screen.
          </p>
          <p>
            You can use RecipePrinter on its own and never touch CookPilot. If you
            do keep recipes there, they come across in a few clicks.
          </p>
        </Prose>
      </LandingSection>

      <LandingClose>
        <p className="text-ink-soft text-cp-body leading-relaxed">
          Curious about the mechanics?{" "}
          <Link href="/how-it-works" className="font-bold text-ink hover:underline">
            See how it works
          </Link>
          .
        </p>
      </LandingClose>
    </LandingFrame>
  );
}
