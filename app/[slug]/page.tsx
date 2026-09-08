import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  SectionHeading,
} from "@/components/seo/LandingFrame";
import { SeoCapture } from "@/components/seo/SeoCapture";
import { Breadcrumb, type Crumb } from "@/components/seo/Breadcrumb";
import { CookbookPitch } from "@/components/seo/CookbookPitch";
import {
  ComparisonTable,
  FeatureRows,
  HeroProductPhoto,
  HowItWorks,
  PhotoGallery,
} from "@/components/seo/LandingVisuals";
import { ExternalIcon, ICON_SIZE } from "@/components/icons";
import {
  SEO_LANDING_PAGE_MAP,
  SEO_LANDING_PAGES,
  layoutForPage,
  seoLandingPageMetadata,
  type SeoLandingPage,
} from "@/lib/seoLandingPages";
import { absoluteUrl, breadcrumbNode, howToNode } from "@/lib/seo";

type PageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return SEO_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) return {};
  return seoLandingPageMetadata(page);
}

// Home › [Page] — a 2-level trail, like Canva's create pages.
function breadcrumbTrail(page: SeoLandingPage): Crumb[] {
  return [
    { name: "Home", href: "/" },
    { name: page.h1, href: `/${page.slug}` },
  ];
}

function pageJsonLd(page: SeoLandingPage) {
  const url = absoluteUrl(`/${page.slug}`);
  const trail = breadcrumbTrail(page);
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
      breadcrumbNode(trail.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href ?? "/") }))),
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: page.faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
      ...(page.howTo && page.howTo.length > 0 ? [howToNode(page.title, page.howTo)] : []),
    ],
  };
}

function CaptureBlock({ page }: { page: SeoLandingPage }) {
  return (
    <div id="rp-capture" className="scroll-mt-24">
      <SeoCapture
        initialMode={page.initialImportMode ?? "url"}
        submitLabel={page.importSubmitLabel ?? "Start printing"}
      />
      {page.captureReassurance !== false && (
        <p className="mt-cp-3 text-cp-small text-ink-soft">
          {page.captureReassurance ?? "Free to use. No account, no clutter."}
        </p>
      )}
      {page.importHint && (
        <p
          className={`${page.captureReassurance === false ? "mt-cp-3" : "mt-cp-2"} text-cp-small text-ink-soft`}
        >
          {page.importHint}
        </p>
      )}
    </div>
  );
}

export default function SeoLandingPage({ params }: PageProps) {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) notFound();

  const isGuide = layoutForPage(page) === "guide-first";

  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
      />

      <LandingHero
        h1={page.h1}
        lede={page.lede}
        above={<Breadcrumb trail={breadcrumbTrail(page)} />}
        note={page.statusNote}
        actions={
          isGuide ? (
            <div className="flex flex-wrap items-center gap-cp-3">
              <LandingCta label={page.importSubmitLabel ?? "Start your cookbook"} />
              {page.howTo && page.howTo.length > 0 && (
                <Link href="#howto-heading" className="btn btn-secondary">
                  See how it works
                </Link>
              )}
            </div>
          ) : (
            <CaptureBlock page={page} />
          )
        }
        aside={
          <HeroProductPhoto
            imageKey={page.heroImage}
            cardKey={isGuide ? "pesto" : "korean"}
            // The two defaults describe the CARD photos, which is what
            // the hero was before a page could name its own. A page that
            // names one is showing something else, so it captions it or
            // says nothing.
            annotation={
              page.heroImage
                ? page.heroAnnotation
                : isGuide
                  ? "Ready for a family cookbook"
                  : "Printed from a recipe link"
            }
            priority
            wide
          />
        }
      />

      {/* Straight after the hero on a comparison page. Someone who searched
          for a competitor's name came to see the two side by side, so the
          table is the answer to their question, not a footnote below three
          feature sections arguing for one of the columns. */}
      {page.comparison && (
        <section aria-labelledby="comparison-heading">
          <div id="comparison-heading">
            <SectionHeading>
              RecipePrinter and {page.comparison.competitor}, side by side
            </SectionHeading>
          </div>
          <div className="mt-cp-6">
            <ComparisonTable
              competitor={page.comparison.competitor}
              groups={page.comparison.groups}
            />
          </div>
        </section>
      )}

      {page.intro && (
        <p className="max-w-[46rem] text-cp-h2-lg font-semibold leading-snug tracking-[-0.02em] text-ink">
          {page.intro}
        </p>
      )}

      {page.howTo && page.howTo.length > 0 && (
        <section aria-labelledby="howto-heading">
          <div id="howto-heading">
            <SectionHeading>How it works</SectionHeading>
          </div>
          <div className="mt-cp-6">
            <HowItWorks steps={page.howTo} />
          </div>
        </section>
      )}

      {page.featureSections && page.featureSections.length > 0 && (
        <section aria-label="Features">
          <FeatureRows features={page.featureSections} />
        </section>
      )}

      {isGuide && (
        <section className="border-y border-line py-[64px]" aria-labelledby="guide-capture-heading">
          <div className="grid gap-cp-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-center lg:gap-[88px]">
            <div>
              <h2 id="guide-capture-heading" className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
                {page.captureHeading ?? "Start here"}
              </h2>
            </div>
            <CaptureBlock page={page} />
          </div>
        </section>
      )}

      {page.cookbookPitch && <CookbookPitch />}

      {page.examples && page.examples.length > 0 && (
        <section aria-labelledby="examples-heading">
          <div id="examples-heading">
            <SectionHeading>Real cards, really printed</SectionHeading>
          </div>
          <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
            Actual recipe cards printed with RecipePrinter, no mockups.
          </p>
          <div className="mt-cp-6">
            <PhotoGallery cardKeys={page.examples} />
          </div>
        </section>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-heading">
        <div id="faq-heading">
          <SectionHeading>Questions people ask</SectionHeading>
        </div>
        <dl className="mt-cp-5 grid gap-cp-4 sm:grid-cols-2">
          {page.faqs.map((item, index) => (
            <div
              key={item.question}
              className="rounded-2xl border border-line bg-card p-cp-5"
            >
              <dt className="flex items-start gap-cp-3 text-cp-body-lg font-extrabold leading-snug tracking-[-0.02em]">
                <span
                  className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[var(--cp-accent-warm)] bg-card text-cp-small font-black text-[var(--cp-ink)]"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="pt-1">{item.question}</span>
              </dt>
              <dd className="mt-cp-3 border-t border-line pt-cp-3 text-ink-soft text-cp-body leading-relaxed">
                {item.answer}
                {item.links && item.links.length > 0 && (
                  <span className="mt-cp-3 flex flex-wrap gap-cp-2">
                    {item.links.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-compact"
                        title={link.note}
                      >
                        {link.label}
                        {/* These are the only links on the page that leave
                            the site, and they open in a new tab. The mark
                            says so before the click rather than after. */}
                        <ExternalIcon size={ICON_SIZE.sm} aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Related ───────────────────────────────────────────────────── */}
      <section aria-labelledby="related-heading">
        <div id="related-heading">
          <SectionHeading>More ways to use RecipePrinter</SectionHeading>
        </div>
        <div className="mt-cp-4 flex flex-wrap gap-cp-3">
          {page.links.map((link) => (
            <Link key={link.href} href={link.href} className="btn btn-secondary btn-compact">
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </LandingFrame>
  );
}
