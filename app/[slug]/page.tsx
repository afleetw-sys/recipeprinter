import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PrinterWorkspace } from "@/components/PrinterWorkspace";
import { ICON_SIZE, PrintIcon } from "@/components/icons";
import { LandingHeroVisual, type HeroVariant } from "@/components/seo/ProductMockup";
import {
  SEO_LANDING_PAGE_MAP,
  SEO_LANDING_PAGES,
  seoLandingPageMetadata,
} from "@/lib/seoLandingPages";
import { absoluteUrl } from "@/lib/seo";

type PageProps = {
  params: { slug: string };
};

const APP_CTA_HREF = "#rp-tool";

export function generateStaticParams() {
  return SEO_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) return {};
  return seoLandingPageMetadata(page);
}

function pageJsonLd(page: (typeof SEO_LANDING_PAGES)[number]) {
  const url = absoluteUrl(`/${page.slug}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: "en",
        about: page.primaryKeyword,
        keywords: [page.primaryKeyword, ...page.secondaryKeywords],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: page.faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}

function heroChips(page: (typeof SEO_LANDING_PAGES)[number]) {
  if (page.slug.includes("without-ads")) {
    return ["No ads", "No pop-ups", "Less paper", "Save as PDF"];
  }
  if (page.slug.includes("pinterest")) {
    return ["Pinterest link", "iPhone friendly", "Screenshots", "Save as PDF"];
  }
  if (page.slug.includes("instagram")) {
    return ["Instagram Reels", "Captions", "Screenshots", "Print card"];
  }
  if (page.slug.includes("facebook")) {
    return ["Facebook posts", "Reels", "Group recipes", "Screenshots"];
  }
  if (page.slug.includes("tiktok")) {
    return ["TikTok videos", "Captions", "Screenshots", "Save as PDF"];
  }
  if (page.slug.includes("youtube")) {
    return ["Video recipes", "Descriptions", "Transcripts", "Print notes"];
  }
  if (page.slug.includes("pdf")) {
    return ["Recipe URL", "Photo", "Screenshot", "Save as PDF"];
  }
  if (page.slug.includes("card")) {
    return ["Website link", "Recipe text", "6 x 4 card", "Recipe binder"];
  }
  if (page.intent === "Utility SEO") {
    return ["Website link", "Social recipe", "Photo or text", "Print or PDF"];
  }
  if (page.slug.includes("binder") || page.slug.includes("organize")) {
    return ["Printed pages", "Recipe cards", "PDF copies", "Family favorites"];
  }
  return ["Old cards", "Recipe photos", "Printed keepsakes", "Family cookbook"];
}

// Which real printed-card photo(s) a page leads with, by intent, so no two
// landing pages open with the same picture.
function heroVisual(page: (typeof SEO_LANDING_PAGES)[number]): HeroVariant {
  const { slug } = page;
  if (slug.includes("pdf")) return "pdf";
  if (slug.includes("card-generator") || slug.includes("card")) return "templates";
  if (slug.includes("binder") || slug.includes("organize")) return "binder";
  if (
    slug.includes("pinterest") ||
    slug.includes("instagram") ||
    slug.includes("tiktok") ||
    slug.includes("facebook") ||
    slug.includes("youtube")
  ) {
    return "social";
  }
  if (page.intent === "Preservation and Gift SEO") return "keepsake";
  return "transform";
}

function LandingCta({
  label = "Start printing recipes",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={APP_CTA_HREF} className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}>
      <PrintIcon size={ICON_SIZE.md} />
      {label}
    </Link>
  );
}

export default function SeoLandingPage({ params }: PageProps) {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) notFound();

  const heroVariant = heroVisual(page);

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
      />

      <SiteHeader
        backHref="/"
        actions={<LandingCta label="Go to printer" />}
      />

      <main className="flex-1 px-cp-6 sm:px-cp-7 lg:px-[40px]">
        <div className="max-w-content mx-auto flex flex-col pt-cp-7 sm:pt-[44px] pb-[72px]">
          <section
            className="relative py-cp-4 sm:py-cp-5"
            aria-labelledby="landing-heading"
          >
            <div className="mx-auto grid max-w-content items-center gap-cp-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-cp-7">
              <div className="text-center lg:text-left">
                <p className="eyebrow">{page.eyebrow}</p>
                <h1
                  id="landing-heading"
                  className="mt-cp-2 text-cp-hero-lg font-extrabold tracking-[-0.04em] leading-[1.02]"
                >
                  {page.h1}
                </h1>
                <p className="mx-auto mt-cp-4 max-w-[42rem] text-ink-soft text-cp-body-lg leading-relaxed lg:mx-0">
                  {page.lede}
                </p>
                <div className="mt-cp-5 flex flex-wrap items-center justify-center gap-cp-3 lg:justify-start">
                  <LandingCta
                    label={page.importSubmitLabel ?? "Start printing recipes"}
                  />
                  <Link href="/how-it-works" className="btn btn-secondary">
                    See how it works
                  </Link>
                </div>
                <p className="mt-cp-3 text-cp-small font-semibold text-ink-soft">
                  Free to use. No account required.
                </p>
                {page.statusNote && (
                  <p className="mx-auto mt-cp-3 max-w-[42rem] rounded-lg border border-line bg-card px-cp-4 py-cp-3 text-cp-small font-semibold leading-relaxed text-ink-soft lg:mx-0">
                    {page.statusNote}
                  </p>
                )}
                <div className="mt-cp-5 flex flex-wrap justify-center gap-cp-2 lg:justify-start">
                  {heroChips(page).map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex min-h-[34px] items-center rounded-full bg-card px-cp-3 text-cp-small font-bold text-ink-soft shadow-sm ring-1 ring-line"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              {/* Desktop: the photo sits beside the copy. On mobile it moves
                  below the tool (see after #rp-tool) so the controls come first. */}
              <div className="hidden lg:block">
                <LandingHeroVisual variant={heroVariant} />
              </div>
            </div>
          </section>

          <section
            id="rp-tool"
            aria-labelledby="get-started-heading"
            className="mt-[44px] scroll-mt-24"
          >
            <h2
              id="get-started-heading"
              className="mb-cp-4 text-cp-h2-lg font-extrabold tracking-[-0.03em]"
            >
              Get started
            </h2>
            <PrinterWorkspace
              initialImportMode={page.initialImportMode}
              importSubmitLabel={page.importSubmitLabel}
            />
            {page.importHint && (
              <p className="mt-cp-3 text-center text-cp-small text-ink-soft">
                {page.importHint}
              </p>
            )}
          </section>

          {/* Mobile-only: the hero photo, shown after the tool so the controls
              lead. On desktop the photo lives in the hero's right column. */}
          <div className="mx-auto mt-[44px] w-full max-w-[420px] lg:hidden">
            <LandingHeroVisual variant={heroVariant} />
          </div>

          <section aria-labelledby="faq-heading" className="mt-[68px] w-full">
            <h2
              id="faq-heading"
              className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
            >
              Questions people ask
            </h2>
            <dl className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
              {page.faqs.map((item) => (
                <div key={item.question} className="card p-cp-5">
                  <dt className="font-extrabold tracking-[-0.02em]">{item.question}</dt>
                  <dd className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="related-heading" className="mt-[68px] w-full">
            <h2
              id="related-heading"
              className="text-cp-h2 font-extrabold tracking-[-0.02em]"
            >
              More ways to use Recipe Printer
            </h2>
            <div className="mt-cp-3 flex flex-wrap gap-cp-3">
              {page.links.map((link) => (
                <Link key={link.href} href={link.href} className="btn btn-secondary btn-compact">
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
