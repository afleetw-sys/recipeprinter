import type { Metadata } from "next";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { FAQ, faqJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Answers about printing recipes from web and social URLs, removing ads, saving recipes as PDFs, screenshots, photos, CookPilot, and RecipePrinter privacy.",
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
        lede="Answers about printing recipes from web and social URLs, screenshots, photos, and text without the ads, clutter, or wasted pages."
      />

      <dl className="flex flex-col gap-cp-4">
        {FAQ.map(({ question, answer }) => (
          <div key={question} className="card p-cp-5">
            <dt>
              <h2 className="font-extrabold tracking-[-0.02em] text-[1.08rem]">
                {question}
              </h2>
            </dt>
            <dd className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">
              {answer}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-cp-7">
        <StartPrintingCta />
      </div>
    </PageShell>
  );
}
