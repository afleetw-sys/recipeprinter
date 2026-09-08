import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { FeatureRows } from "@/components/seo/LandingVisuals";
import { GuidePicker } from "@/components/seo/GuidePicker";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
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
const IMPORT_ROWS = [
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
      "Whichever one you have, it comes out the same way: a printable recipe you can hold. A food blog, a Pinterest pin, an Instagram or TikTok link. A photo of a cookbook page or an old recipe card. A screenshot. A paragraph pasted out of a message.",
  },
  {
    // Lived under "everything else" until it was pointed out that an import
    // belongs with the imports.
    heading: "Paprika and CookPilot import",
    body:
      "Sign in to CookPilot, or open a Paprika export file, and add what you want to the print queue. A Paprika file is read in your browser, so nothing is uploaded.",
  },
];

const EDIT_ROWS = [
  {
    heading: "Inline editing",
    body:
      "The title, ingredients, steps, and notes are editable right on the card. Correct an amount, drop a step you do not need, or add the note you would otherwise have written in the margin.",
  },
  {
    heading: "Premium print themes",
    image: "multi-themes",
    body:
      "A theme changes a card's type, its border, and how the photo sits, without touching the recipe underneath. Switch themes and every card in the batch follows, so a stack printed in one go still looks like a set. Several are free, and the premium ones are a one-time purchase.",
  },
];

const PRINT_ROWS = [
  {
    heading: "4 by 6 recipe cards",
    image: "card-in-box",
    body:
      "They drop straight into a recipe box, or print a letter-size page for a binder instead. Cut lines give you a trim guide on card stock, and a recipe too long for one side carries on onto the back rather than being cut short.",
  },
  {
    heading: "Cookbook builder",
    image: "bound-cookbook",
    body:
      "Group the recipes you kept into chapters, add a cover, and RecipePrinter builds the table of contents for you. Export a print-ready PDF to run off at home in US Letter, or a full-bleed 8 by 10 to order a bound hardcover from a service like Lulu or Blurb. It is a one-time purchase for the book you make.",
  },
  {
    heading: "Batch printing",
    body:
      "Build a queue from different sources, choose the recipes you want, and print them together for a recipe binder, a week of dinners, or a family cookbook.",
  },
  {
    heading: "PDF export",
    image: "pdf-search",
    body:
      "Choose Save as PDF in the print dialog to keep the printable recipe on your device rather than sending it to paper, searchable and to hand the next time you make it.",
  },
];

function PickerRow({ label, pages }: { label: string; pages: typeof SEO_LANDING_PAGES }) {
  return (
    <div className="mt-cp-7 border-t border-line pt-cp-5">
      <p className="text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </p>
      <div className="mt-cp-3">
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

        h1="A recipe printing tool for recipes worth keeping"
        lede="RecipePrinter turns websites, social links, photos, screenshots, and text into printable recipe cards, pages, PDFs, and cookbooks you can cook from, save, and collect."
        above={<Breadcrumb trail={TRAIL} />}
        actions={<LandingCta href="/" />}
        note="Printing is free and needs no account."
      />

      <LandingSection
        id="import-heading"
        heading="Import from anywhere"
        lede="A recipe reaches you as a web page, a photo, or a paragraph someone texted you. None of that is built to cook from."
      >
        <FeatureRows features={IMPORT_ROWS} />
        <PickerRow label="Guides by source" pages={byGroup("source")} />
      </LandingSection>

      <LandingSection
        id="edit-heading"
        heading="Edit it before it prints"
        lede="Whatever came across is yours to correct, cut, annotate, and restyle while it is still on screen."
      >
        <FeatureRows features={EDIT_ROWS} />
      </LandingSection>

      <LandingSection
        id="print-heading"
        heading="Print how you want"
        lede="A recipe card for the counter, a letter page for the binder, a PDF for your phone, or a bound book to give away."
      >
        <FeatureRows features={PRINT_ROWS} />
        <PickerRow label="Guides by what you make" pages={byGroup("output")} />
      </LandingSection>

      <div>
        <LandingCta href="/" />
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
