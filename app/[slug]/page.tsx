import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SeoCapture } from "@/components/seo/SeoCapture";
import { Breadcrumb, type Crumb } from "@/components/seo/Breadcrumb";
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
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={CAPTURE_HREF} className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}>
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
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
      />

      <SiteHeader actions={<LandingCta label="Go to printer" />} />

      <main className="flex-1 px-cp-6 sm:px-cp-7 lg:px-[40px]">
        <div className="max-w-content mx-auto flex flex-col gap-[72px] pt-cp-5 pb-[80px]">
          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-cp-6">
            <Breadcrumb trail={breadcrumbTrail(page)} />
            <section
              className="grid items-center gap-cp-7 py-cp-3 lg:grid-cols-2 lg:gap-[64px]"
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
                {isGuide ? (
                  <div className="mt-cp-5 flex flex-wrap items-center gap-cp-3">
                    <LandingCta label={page.importSubmitLabel ?? "Start your cookbook"} />
                    {page.howTo && page.howTo.length > 0 && (
                      <Link href="#howto-heading" className="btn btn-secondary">
                        See how it works
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="mt-cp-5">
                    <CaptureBlock page={page} />
                  </div>
                )}
                {page.statusNote && (
                  <p className="mt-cp-5 max-w-[40rem] border-l-2 border-line pl-cp-4 text-cp-small leading-relaxed text-ink-soft">
                    {page.statusNote}
                  </p>
                )}
              </div>
              <HeroProductPhoto
                cardKey={isGuide ? "pesto" : "korean"}
                annotation={isGuide ? "Ready for a family cookbook" : "Printed from a recipe link"}
                priority
                wide
              />
            </section>
          </div>

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
                    Start your family cookbook
                  </h2>
                </div>
                <CaptureBlock page={page} />
              </div>
            </section>
          )}

          {page.examples && page.examples.length > 0 && (
            <section aria-labelledby="examples-heading">
              <div id="examples-heading">
                <SectionHeading>Real cards, really printed</SectionHeading>
              </div>
              <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
                Actual recipe cards printed with Recipe Printer, no mockups.
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
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── Related ───────────────────────────────────────────────────── */}
          <section aria-labelledby="related-heading">
            <div id="related-heading">
              <h2 className="text-cp-h2 font-extrabold tracking-[-0.02em]">More ways to use Recipe Printer</h2>
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
