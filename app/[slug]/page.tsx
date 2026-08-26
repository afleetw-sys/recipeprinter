import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SeoCapture } from "@/components/seo/SeoCapture";
import { Breadcrumb, type Crumb } from "@/components/seo/Breadcrumb";
import { FaqAnswer } from "@/components/seo/FaqAnswer";
import {
  FeatureRows,
  HeroProductPhoto,
  HowItWorks,
  PhotoGallery,
} from "@/components/seo/LandingVisuals";
import { ICON_SIZE, PrintIcon } from "@/components/icons";
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

const CAPTURE_HREF = "#rp-capture";

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

function LandingCta({
  label = "Start printing recipes",
  variant = "primary",
  compact = false,
}: {
  label?: string;
  variant?: "primary" | "secondary";
  /** Tighten padding/text on mobile so the header CTA fits inline with the
      wordmark and account button; full size returns at the `sm` breakpoint. */
  compact?: boolean;
}) {
  return (
    <Link
      href={CAPTURE_HREF}
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}${
        compact ? " hidden sm:inline-flex px-cp-3 text-cp-small sm:px-[18px] sm:text-cp-body" : ""
      }`}
    >
      <PrintIcon size={ICON_SIZE.md} />
      {label}
    </Link>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">{children}</h2>;
}

function CaptureBlock({ page }: { page: SeoLandingPage }) {
  return (
    <div id="rp-capture" className="scroll-mt-24">
      <SeoCapture
        initialMode={page.initialImportMode ?? "url"}
        modes={page.captureModes}
        submitLabel={page.importSubmitLabel ?? "Start printing"}
      />
    </div>
  );
}

export default function SeoLandingPage({ params }: PageProps) {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) notFound();

  const isGuide = layoutForPage(page) === "guide-first";
  const closingHeading = page.captureHeading ?? "Start with one recipe";

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
      />

      <SiteHeader actions={<LandingCta label="Start printing" compact />} />

      <main className="flex-1 px-cp-6 sm:px-cp-7 lg:px-[40px]">
        {/* Section rhythm: the gap is what separates one argument from the next,
            so it opens up once there is room for it. */}
        <div className="max-w-content mx-auto flex flex-col gap-[80px] pt-cp-5 pb-[96px] lg:gap-[104px]">
          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-cp-6">
            <Breadcrumb trail={breadcrumbTrail(page)} />
            <section
              /* The copy carries the heading, the lede and the whole importer,
                 so it takes the larger share; the photo takes what is left. */
              className="grid items-center gap-cp-7 py-cp-3 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] lg:gap-[56px]"
              aria-labelledby="landing-heading"
            >
              <div>
                <h1
                  id="landing-heading"
                  className="text-cp-hero-lg font-extrabold leading-[1.04] tracking-[-0.04em]"
                >
                  {page.h1}
                </h1>
                <p className="mt-cp-4 max-w-[40rem] text-cp-body-lg leading-relaxed text-ink-soft">
                  {page.lede}
                </p>
                <div className="mt-cp-5">
                  <CaptureBlock page={page} />
                </div>
              </div>
              <HeroProductPhoto
                cardKey={page.heroCard}
                annotation={page.heroAnnotation}
                priority
                wide
                tall={page.initialImportMode === "image" || page.initialImportMode === "text"}
              />
            </section>
          </div>

          {/* The intro belongs TO the steps, not between two sections: on its own
              it sat in 72px of air top and bottom and read as a stray line. */}
          {page.howTo && page.howTo.length > 0 ? (
            <section aria-labelledby="howto-heading">
              <div id="howto-heading">
                <SectionHeading>How it works</SectionHeading>
              </div>
              {page.intro && (
                <p className="mt-cp-2 text-cp-body-lg leading-relaxed text-ink-soft">
                  {page.intro}
                </p>
              )}
              <div className="mt-cp-6">
                <HowItWorks steps={page.howTo} />
              </div>
            </section>
          ) : (
            page.intro && (
              <p className="text-cp-body-lg leading-relaxed text-ink-soft">
                {page.intro}
              </p>
            )
          )}

          {page.featureSections && page.featureSections.length > 0 && (
            <section aria-label="Features">
              <FeatureRows features={page.featureSections} />
            </section>
          )}

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
                      className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--cp-accent-soft)] text-cp-small font-black text-[var(--cp-accent-ink)]"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="pt-1">{item.question}</span>
                  </dt>
                  <dd className="mt-cp-3 border-t border-line pt-cp-3 text-ink-soft text-cp-body leading-relaxed">
                    {item.emphasize === false ? (
                      item.answer
                    ) : (
                      <FaqAnswer answer={item.answer} lead={item.emphasize} />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── Closing action ────────────────────────────────────────────── */}
          <section className="border-t border-line pt-[48px]" aria-labelledby="closing-heading">
            <h2 id="closing-heading" className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
              {closingHeading}
            </h2>
            <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
              Nothing to install and no account needed. Paste a link, upload a photo of a
              recipe, or paste the text.
            </p>
            <div className="mt-cp-4">
              {/* Never the same words as the heading directly above it. */}
              <LandingCta
                label={page.ctaLabel && page.ctaLabel !== closingHeading ? page.ctaLabel : "Start printing"}
              />
            </div>
          </section>

          {/* ── Related ───────────────────────────────────────────────────── */}
          <section aria-labelledby="related-heading">
            <div id="related-heading">
              <h2 className="text-cp-h2 font-extrabold tracking-[-0.02em]">More ways to use RecipePrinter</h2>
            </div>
            <div className="mt-cp-4 flex flex-wrap gap-cp-3">
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
