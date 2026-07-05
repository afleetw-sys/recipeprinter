import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { CheckIcon, PrintIcon } from "@/components/icons";
import {
  SEO_LANDING_PAGE_MAP,
  SEO_LANDING_PAGES,
  seoLandingPageMetadata,
} from "@/lib/seoLandingPages";
import { absoluteUrl } from "@/lib/seo";

type PageProps = {
  params: { slug: string };
};

const APP_CTA_HREF = "/#rp-main";

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

function RecipePageVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-line bg-card p-cp-4 shadow-sm">
      <div className="absolute right-4 top-4 opacity-15" aria-hidden>
        <Image
          src="/images/heirloom-whisk.svg"
          alt=""
          width={76}
          height={76}
          className="h-[76px] w-[76px]"
        />
      </div>

      <div className="relative grid gap-cp-3">
        <div>
          <p className="text-cp-label font-extrabold uppercase tracking-[0.12em] text-brand-ink">
            Recipe Printer output
          </p>
          <h2 className="mt-cp-1 text-cp-h2 font-extrabold tracking-[-0.03em]">
            A printable recipe you can cook from
          </h2>
        </div>

        <div className="rounded border border-line bg-white p-cp-4">
          <div className="flex items-start justify-between gap-cp-4 border-b border-line pb-cp-2">
            <div>
              <p className="font-serif text-[1.28rem] leading-tight text-ink">
                Lemon Sunday Pasta
              </p>
              <p className="mt-1 text-cp-caption font-semibold text-ink-soft">
                25 min · Serves 4 · Saved from a recipe link
              </p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-brand-50 text-brand-ink">
              <PrintIcon size={18} />
            </span>
          </div>

          <div className="mt-cp-3 grid gap-cp-4 sm:grid-cols-[0.8fr_1fr]">
            <div>
              <p className="text-cp-label font-extrabold uppercase tracking-[0.1em] text-brand-ink">
                Ingredients
              </p>
              <ul className="mt-cp-2 space-y-0.5 text-cp-small text-ink-soft">
                <li>Spaghetti</li>
                <li>Lemon zest</li>
                <li>Parmesan</li>
                <li>Olive oil</li>
              </ul>
            </div>
            <div>
              <p className="text-cp-label font-extrabold uppercase tracking-[0.1em] text-brand-ink">
                Steps
              </p>
              <ol className="mt-cp-2 space-y-0.5 text-cp-small text-ink-soft">
                <li>Boil pasta until tender.</li>
                <li>Toss warm with lemon and cheese.</li>
                <li>Print, mark up, and keep.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="grid gap-cp-2 text-cp-small font-semibold text-ink-soft sm:grid-cols-3">
          <span className="inline-flex items-center gap-2">
            <CheckIcon size={16} /> Cards
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckIcon size={16} /> Pages
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckIcon size={16} /> PDFs
          </span>
        </div>
      </div>
    </div>
  );
}

function heroChips(page: (typeof SEO_LANDING_PAGES)[number]) {
  if (page.slug.includes("pinterest")) {
    return ["Pinterest link", "Recipe screenshot", "Printable card", "Save as PDF"];
  }
  if (page.slug.includes("instagram")) {
    return ["Instagram caption", "Recipe screenshot", "Paste text", "Print card"];
  }
  if (page.slug.includes("tiktok")) {
    return ["TikTok caption", "Recipe notes", "Screenshots", "Save as PDF"];
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

function LandingCta({
  label = "Start printing recipes",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={APP_CTA_HREF} className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}>
      <PrintIcon size={18} />
      {label}
    </Link>
  );
}

export default function SeoLandingPage({ params }: PageProps) {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) notFound();

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

      <main className="flex-1 px-cp-6">
        <div className="max-w-content mx-auto flex flex-col gap-[52px] pt-cp-6 sm:pt-cp-7 pb-cp-7">
          <section
            className="relative overflow-hidden py-cp-7 sm:py-cp-8"
            aria-labelledby="landing-heading"
          >
            <Image
              src="/images/heirloom-ladle.svg"
              alt=""
              width={150}
              height={150}
              className="absolute bottom-4 right-6 hidden opacity-10 sm:block"
              aria-hidden
            />
            <div className="relative mx-auto flex max-w-[920px] flex-col items-center text-center">
              <div className="max-w-[760px]">
                <p className="eyebrow">{page.eyebrow}</p>
                <h1
                  id="landing-heading"
                  className="mt-cp-2 text-cp-hero-lg font-extrabold tracking-[-0.04em] leading-[1.02]"
                >
                  {page.h1}
                </h1>
                <p className="mx-auto mt-cp-4 max-w-[42rem] text-ink-soft text-cp-body-lg leading-relaxed">
                  {page.lede}
                </p>
                <div className="mt-cp-5 flex flex-wrap items-center justify-center gap-cp-3">
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
              </div>

              <div className="mt-cp-5 flex flex-wrap justify-center gap-cp-2">
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
          </section>

          <RecipePageVisual />

          <section aria-labelledby="steps-heading" className="mx-auto w-full max-w-[1040px]">
            <div className="max-w-[680px]">
              <h2
                id="steps-heading"
                className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
              >
                {page.stepsTitle}
              </h2>
              <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
                Recipe Printer keeps the path short: add the recipe, review the
                printable version, then print or save it.
              </p>
            </div>
            <ol className="mt-cp-4 grid gap-cp-3 md:grid-cols-3">
              {page.steps.map((step, index) => (
                <li key={step} className="card p-cp-4">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-cp-body font-extrabold text-brand-ink">
                    {index + 1}
                  </span>
                  <p className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-label="Recipe Printer benefits" className="mx-auto grid w-full max-w-[1040px] gap-cp-4 md:grid-cols-2">
            {page.sections.map((section) => (
              <div key={section.h2} className="card p-cp-5">
                <h2 className="text-cp-h2 font-extrabold tracking-[-0.02em]">
                  {section.h2}
                </h2>
                <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
                  {section.body}
                </p>
              </div>
            ))}
          </section>

          <section
            aria-labelledby="cta-heading"
            className="mx-auto w-full max-w-[1040px] rounded-xl bg-brand-50 px-cp-5 py-cp-6 sm:px-cp-7"
          >
            <div className="flex flex-col gap-cp-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="cta-heading" className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
                  Ready to turn it into a printable recipe?
                </h2>
                <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
                  Open the Recipe Printer tool, add your recipe, and make a card,
                  page, or PDF worth keeping.
                </p>
              </div>
              <div className="shrink-0">
                <LandingCta label="Go to Recipe Printer" />
              </div>
            </div>
          </section>

          <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-[760px]">
            <h2
              id="faq-heading"
              className="text-cp-h2-lg font-extrabold tracking-[-0.03em]"
            >
              Questions people ask
            </h2>
            <dl className="mt-cp-4 flex flex-col gap-cp-3">
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

          <section aria-labelledby="related-heading" className="mx-auto w-full max-w-[1040px]">
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
