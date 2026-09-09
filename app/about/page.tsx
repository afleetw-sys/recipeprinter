import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
} from "@/components/seo/LandingFrame";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import {
  SITE_ID,
  absoluteUrl,
  breadcrumbNode,
  organizationNode,
  pageMetadata,
} from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Why I Built a Recipe Printer",
  description:
    "I kept recipes on a screen for years and said no to printing for months. Here's what changed my mind, and why RecipePrinter is free to print with.",
  path: "/about",
});

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
];

const CONTACT_EMAIL = "recipeprinter@goodproblem.studio";

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
      name: "Why I Built a Recipe Printer",
      description:
        "Why RecipePrinter exists, told by the person who built it: a digital-only recipe keeper who kept being asked to print, said no for months, and then got hooked.",
      inLanguage: "en",
      // First-person account of building the thing, which is the one page here
      // with genuine first-hand experience on it. Dates let that be read as a
      // dated statement rather than undated marketing copy.
      datePublished: "2026-07-02",
      dateModified: "2026-09-09",
      isPartOf: { "@id": SITE_ID },
    },
    organizationNode(),
    breadcrumbNode(
      TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) })),
    ),
  ],
};

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-bold text-ink hover:underline">
      {children}
    </Link>
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
        lede="Hi. I made RecipePrinter, and I didn&apos;t expect to. Six months ago every recipe I owned lived on a screen, and that suited me fine."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" label="Start printing for free" />}
      />

      {/* One block, not a ladder of headings. The last version broke the same
          story into three titled sections, which gave a crawler something to
          read but turned a personal account into a document with chapters.
          Headings are for pages you skim; this one is meant to be read
          straight through, so it is a single column of paragraphs at reading
          width and the page's only <h2> is the one at the close. */}
      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-cp-5 text-ink-soft text-cp-prose leading-relaxed">
        <p>
          I was a die hard digital recipe organizer. I built CookPilot, a recipe app,
          to help me adapt recipes to real life, mostly because I was forever telling
          ChatGPT that I was out of this or short on that.
        </p>
        <p>
          I shared it with friends and family, and the same question kept coming
          back. This is great, but can I print them? Or{" "}
          <InlineLink href="/family-recipe-book">turn them into a cookbook</InlineLink>?
          Like I said, I lived digital. It&apos;s all I ever knew, so I rejected the idea
          for a long time. But the feedback kept coming. Eventually I thought, ok,
          I&apos;ve already built the parser, so let&apos;s do it.
        </p>
        <p>
          I started printing our favorites, the ones we&apos;d already made more than
          once, and the first time I cooked from a printed card I was hooked. It was so
          much easier. No scrolling up and down. My phone is always dead by dinner, so
          the screen is at its dimmest right when I need to read from it. It instantly
          improved my life. I was sold.
        </p>
        <p>
          Now I use both. CookPilot is where I keep recipes I might make and change
          things on the fly. Everything we cook on repeat gets{" "}
          <InlineLink href="/how-it-works">printed with RecipePrinter</InlineLink>.
        </p>
      </div>

      <LandingClose centered>
        <p className="text-ink-soft text-cp-body-lg leading-relaxed">
          This whole thing exists because people kept asking for something I&apos;d already
          said no to, and they were right. So tell me what you want it to do. Write to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-bold text-ink hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          , or use the Give feedback button in the footer. I read everything, and
          I&apos;m done turning down good ideas.
        </p>
      </LandingClose>
    </LandingFrame>
  );
}
