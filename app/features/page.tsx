import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { FeatureCards, type FeatureCard } from "@/components/seo/FeatureCards";
import { GuidePicker } from "@/components/seo/GuidePicker";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import { absoluteUrl, breadcrumbNode, pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";

export const metadata: Metadata = pageMetadata({
  title: "Recipe Printing Tool for Recipes Worth Keeping",
  description:
    "A recipe printing tool for turning links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and collections.",
  path: "/features",
});

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "Features", href: "/features" },
];

// The visible breadcrumb needs its BreadcrumbList to mean anything to a
// crawler, and this page had neither before it moved onto the landing frame.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl("/features")}#webpage`,
      url: absoluteUrl("/features"),
      name: "Recipe Printing Tool for Recipes Worth Keeping",
      description:
        "A recipe printing tool for turning links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and collections.",
      inLanguage: "en",
    },
    breadcrumbNode(
      TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) })),
    ),
  ],
};

// Split by the same two questions the guide pickers ask, so a category argues
// itself and then points at its own pages. Canva's features page does this:
// every category carries a spotlight it explains properly, and the links to the
// individual tools sit directly under it. Ours had all the proof at the top and
// all the navigation at the bottom, so a reader convinced by the recipe card
// photograph had to scroll past everything else to find the recipe card guide.
// Import, edit, print: the order the work actually happens in, and the same
// three steps /how-it-works walks through. Each row is a named feature with the
// argument for it underneath, and a photograph where one exists. A row without
// an image renders as a plain text block, which is the right weight for the
// smaller tools rather than a reason to invent a picture for them.
const IMPORT_CARDS: FeatureCard[] = [
  {
    heading: "Ad-free imports",
    image: "before-after",
    body:
      "The title, ingredients, instructions, notes, prep time, cook time, and servings come across when the page has them. Ads, pop-ups, comments, autoplay video, and the story before the recipe do not.",
  },
  {
    heading: "Links, photos, screenshots, and text",
    image: "paste-in-app",
    body:
      "Whichever one you have, it comes out the same way: a printable recipe you can hold. A Pinterest pin, an Instagram or TikTok link, a photo of an old recipe card, a paragraph pasted out of a message.",
  },
  {
    // Lived under "everything else" until it was pointed out that an import
    // belongs with the imports.
    heading: "Paprika and CookPilot import",
    image: "cookpilot-export",
    body:
      "Sign in to CookPilot, or open a Paprika export file, and add what you want to the print queue. A Paprika file is read in your browser, so nothing is uploaded.",
  },
];

const YOURS_CARDS: FeatureCard[] = [
  {
    heading: "Inline editing",
    needs:
      "A recipe card mid-edit on screen, an ingredient amount being corrected with the cursor in the line.",
    body:
      "The title, ingredients, steps, and notes are editable right on the card. Correct an amount, drop a step you do not need, or add the note you would otherwise have written in the margin.",
  },
  {
    heading: "Photos on the card",
    needs:
      "One recipe printed twice side by side, once with its photo and once without, to show the space the picture takes.",
    body:
      "A recipe prints with its photo or without it, decided per recipe, so a card that is mostly method does not give half its space to a picture. When the photo does print, drag it to move the crop and put the part that matters in frame.",
  },
  {
    heading: "Premium print themes",
    image: "multi-themes",
    body:
      "A theme changes a card's type, its border, and how the photo sits, without touching the recipe underneath. Switch themes and every card in the batch follows, so a stack printed in one go still looks like a set. Several are free, and the premium ones are a one-time purchase.",
  },
];

const PRINT_CARDS: FeatureCard[] = [
  {
    heading: "4 by 6 recipe cards or letter pages",
    image: "card-in-box",
    body:
      "A 4 by 6 recipe card drops straight into a recipe box; a letter page goes into a binder. Cut lines give you a trim guide on card stock, and a recipe too long for one side continues on the back.",
  },
  {
    // Batch and PDF were two cards saying the same thing from either end: how
    // the finished job leaves. One card, both destinations.
    heading: "Batch printing and PDF export",
    image: "pdf-search",
    body:
      "Add as many recipes as you like to the print queue and send them all in one go, for a recipe binder, a week of dinners, or a family cookbook. Or save the printable recipes as a PDF instead.",
  },
  {
    heading: "Cookbook builder",
    image: "bound-cookbook",
    body:
      `RecipePrinter sorts the recipes into chapters, generates the cover, and builds the table of contents. Rearrange anything, then print it at home, keep the PDF, or send the file to Lulu or Blurb for a hardcover or spiral bound cookbook. ${COOKBOOK_PRICE_FALLBACK} once.`,
  },
];

function PickerRow({ label, pages }: { label: string; pages: typeof SEO_LANDING_PAGES }) {
  return (
    // A recessed tone rather than a rule. A hairline under the last card read
    // as one more divider inside the section, so the guides looked like the
    // end of the argument instead of a shelf of pages to go and read. Three
    // percent ink over the page ground is enough to say "different thing"
    // without asking for attention.
    <div className="mt-cp-7 rounded-2xl bg-[var(--cp-surface-muted)] p-cp-5 sm:p-cp-6">
      <p className="text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </p>
      <div className="mt-cp-4">
        <GuidePicker pages={pages} />
      </div>
    </div>
  );
}

// Grouped by what the reader is actually choosing between, which `intent`
// could not express: it drives page layout, and it filed the Just the Recipe
// comparison under "Utility SEO", putting a competitor page in the list of
// ways you might have found a recipe.
const byGroup = (group: string) =>
  SEO_LANDING_PAGES.filter((page) => page.pickerGroup === group);

export default function FeaturesPage() {
  const comparisons = byGroup("comparison");

  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" href="/" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <LandingHero
        align="centered"
        h1="A recipe printing tool for the ones worth keeping"
        lede="Recipes live on screens and get cooked in kitchens. RecipePrinter moves them onto paper you can hold, mark up, and hand down."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" label="Start printing for free" />}
      />

      <LandingSection
        id="print-heading"
        heading="Print how you want"
      >
        <FeatureCards items={PRINT_CARDS} />
        <PickerRow label="Guides by what you end up with" pages={byGroup("output")} />
      </LandingSection>

      <LandingSection
        id="import-heading"
        heading="Import from anywhere"
      >
        <FeatureCards items={IMPORT_CARDS} />
        <PickerRow label="Guides by what you import" pages={byGroup("source")} />
      </LandingSection>

      <LandingSection
        id="yours-heading"
        heading="Make it yours"
      >
        <FeatureCards items={YOURS_CARDS} />
      </LandingSection>

      <div>
        <LandingCta href="/" label="Start printing for free" />
      </div>
      {comparisons.length > 0 && (
        <p className="text-ink-soft text-cp-body leading-relaxed">
          Comparing tools? See RecipePrinter next to{" "}
          {comparisons.map((page, index) => (
            <span key={page.slug}>
              {index > 0 && (index === comparisons.length - 1 ? " or " : ", ")}
              <Link href={`/${page.slug}`} className="font-bold text-ink hover:underline">
                {page.shortLabel}
              </Link>
            </span>
          ))}
          .
        </p>
      )}

    </LandingFrame>
  );
}
