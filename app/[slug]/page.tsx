import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, StartPrintingCta } from "@/components/PageShell";
import { PrinterWorkspace } from "@/components/PrinterWorkspace";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  SEO_LANDING_PAGE_MAP,
  SEO_LANDING_PAGES,
  seoLandingPageMetadata,
} from "@/lib/seoLandingPages";
import { absoluteUrl } from "@/lib/seo";

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

export default function SeoLandingPage({ params }: PageProps) {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) notFound();

  if (page.intent === "Utility SEO") {
    return (
      <div className="min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
        />

        <SiteHeader backHref="/" />

        <main className="flex-1 px-cp-6">
          <div className="max-w-content mx-auto flex flex-col gap-cp-7 pt-cp-6 sm:pt-cp-7 pb-cp-7">
            <header className="max-w-[48rem]">
              <p className="eyebrow">{page.eyebrow}</p>
              <h1 className="mt-cp-2 text-[clamp(2rem,5vw,2.75rem)] font-extrabold tracking-[-0.04em] leading-[1.05]">
                {page.h1}
              </h1>
              <p className="mt-cp-3 text-ink-soft text-[1.02rem] leading-relaxed">
                {page.lede}
              </p>
            </header>

            <PrinterWorkspace
              initialImportMode={page.initialImportMode}
              importSubmitLabel={page.importSubmitLabel}
            />

            <div className="max-w-[720px] flex flex-col gap-cp-7">
              <section aria-labelledby="steps-heading">
                <h2
                  id="steps-heading"
                  className="text-[1.35rem] font-extrabold tracking-[-0.03em]"
                >
                  {page.stepsTitle}
                </h2>
                <ol className="mt-cp-4 grid gap-cp-3 sm:grid-cols-3">
                  {page.steps.map((step, index) => (
                    <li key={step} className="card p-cp-4">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-[0.9rem] font-extrabold text-brand-ink">
                        {index + 1}
                      </span>
                      <p className="mt-cp-3 text-ink-soft text-[0.92rem] leading-relaxed">
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              {page.sections.map((section) => (
                <section key={section.h2} aria-labelledby={`${page.slug}-${section.h2}`}>
                  <h2
                    id={`${page.slug}-${section.h2}`}
                    className="text-[1.35rem] font-extrabold tracking-[-0.03em]"
                  >
                    {section.h2}
                  </h2>
                  <p className="mt-cp-3 text-ink-soft leading-relaxed">
                    {section.body}
                  </p>
                </section>
              ))}

              <section aria-labelledby="faq-heading">
                <h2
                  id="faq-heading"
                  className="text-[1.35rem] font-extrabold tracking-[-0.03em]"
                >
                  Questions people ask
                </h2>
                <dl className="mt-cp-4 flex flex-col gap-cp-3">
                  {page.faqs.map((item) => (
                    <div key={item.question} className="card p-cp-5">
                      <dt className="font-extrabold tracking-[-0.02em]">
                        {item.question}
                      </dt>
                      <dd className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">
                        {item.answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="related-heading">
                <h2
                  id="related-heading"
                  className="text-[1.1rem] font-extrabold tracking-[-0.02em]"
                >
                  Related Recipe Printer tools
                </h2>
                <div className="mt-cp-3 flex flex-wrap gap-cp-3">
                  {page.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="btn btn-secondary btn-compact"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    );
  }

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
      />

      <header className="mb-cp-7">
        <p className="eyebrow">{page.eyebrow}</p>
        <h1 className="mt-cp-2 text-[clamp(1.9rem,4.5vw,2.5rem)] font-extrabold tracking-[-0.04em] leading-[1.08]">
          {page.h1}
        </h1>
        <p className="mt-cp-4 text-ink-soft text-[1.05rem] leading-relaxed">
          {page.lede}
        </p>
        <div className="mt-cp-5">
          <StartPrintingCta label="Start with a recipe" />
        </div>
      </header>

      <div className="flex flex-col gap-cp-7">
        <section aria-labelledby="steps-heading">
          <h2
            id="steps-heading"
            className="text-[1.35rem] font-extrabold tracking-[-0.03em]"
          >
            {page.stepsTitle}
          </h2>
          <ol className="mt-cp-4 grid gap-cp-3">
            {page.steps.map((step, index) => (
              <li key={step} className="card p-cp-5 flex gap-cp-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[0.9rem] font-extrabold text-brand-ink">
                  {index + 1}
                </span>
                <p className="text-ink-soft leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {page.sections.map((section) => (
          <section key={section.h2} aria-labelledby={`${page.slug}-${section.h2}`}>
            <h2
              id={`${page.slug}-${section.h2}`}
              className="text-[1.35rem] font-extrabold tracking-[-0.03em]"
            >
              {section.h2}
            </h2>
            <p className="mt-cp-3 text-ink-soft leading-relaxed">{section.body}</p>
          </section>
        ))}

        <section aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="text-[1.35rem] font-extrabold tracking-[-0.03em]"
          >
            Questions people ask
          </h2>
          <dl className="mt-cp-4 flex flex-col gap-cp-3">
            {page.faqs.map((item) => (
              <div key={item.question} className="card p-cp-5">
                <dt className="font-extrabold tracking-[-0.02em]">{item.question}</dt>
                <dd className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="related-heading">
          <h2
            id="related-heading"
            className="text-[1.1rem] font-extrabold tracking-[-0.02em]"
          >
            Related Recipe Printer guides
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
    </PageShell>
  );
}
