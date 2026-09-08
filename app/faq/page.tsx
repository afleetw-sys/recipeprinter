import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { FAQ, faqJsonLd, pageMetadata } from "@/lib/seo";
import { anchorFor, SEO_LANDING_PAGE_MAP } from "@/lib/seoLandingPages";

/** Resolve an answer's `guides` slugs, dropping any that no longer exist. */
function guidePagesFor(slugs: string[] | undefined) {
  return (slugs ?? [])
    .map((slug) => SEO_LANDING_PAGE_MAP.get(slug))
    .filter((page): page is NonNullable<typeof page> => Boolean(page));
}

export const metadata: Metadata = pageMetadata({
  title: "Recipe Printer FAQ",
  description:
    "Answers about printing recipes from websites, URLs, Pinterest, Instagram, TikTok, PDFs, recipe cards, binders, and privacy.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />

      <PageHeader
        title="Frequently asked questions"
        lede="Answers about printing recipes from websites, URLs, social posts, screenshots, photos, and text as printable cards, pages, and PDFs."
      />

      <dl className="flex flex-col gap-cp-4">
        {FAQ.map(({ question, answer, guides }) => {
          const guidePages = guidePagesFor(guides);
          return (
            <div key={question} className="card p-cp-5">
              <dt>
                <h2 className="font-extrabold tracking-[-0.02em] text-cp-h2">
                  {question}
                </h2>
              </dt>
              <dd className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
                {answer}
                {guidePages.length > 0 && (
                  <span className="mt-cp-3 flex flex-wrap gap-x-cp-4 gap-y-cp-2">
                    {guidePages.map((page) => (
                      <Link
                        key={page.slug}
                        href={`/${page.slug}`}
                        className="font-bold text-ink hover:underline"
                      >
                        {anchorFor(page)}
                      </Link>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-cp-7">
        <StartPrintingCta />
      </div>
    </PageShell>
  );
}
