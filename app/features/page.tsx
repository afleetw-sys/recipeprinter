import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  LandingSection,
} from "@/components/seo/LandingFrame";
import { FeatureCards } from "@/components/seo/FeatureCards";
import { PickerRow } from "@/components/seo/PickerRow";
import { LandingClose } from "@/components/seo/LandingClose";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl, breadcrumbNode, pageMetadata } from "@/lib/seo";
import { SEO_LANDING_PAGES } from "@/lib/seoLandingPages";
import { IMPORT_CARDS, PRINT_CARDS, YOURS_CARDS } from "@/lib/seoFeatureCards";

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

      <LandingClose>
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
      </LandingClose>

    </LandingFrame>
  );
}
