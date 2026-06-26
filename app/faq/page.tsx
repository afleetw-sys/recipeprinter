import type { Metadata } from "next";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { FAQ, faqJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Answers to common questions about printing recipes from the web with RecipePrinter — " +
    "removing ads, saving as PDF, printing from photos, printing multiple recipes, and privacy.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <PageShell>
      {/* FAQPage structured data lives here, with the full question set. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />

      <PageHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        lede="Everything people usually want to know about turning online recipes into clean, printable pages."
      />

      <dl className="flex flex-col gap-cp-4">
        {FAQ.map(({ question, answer }) => (
          <div key={question} className="card p-cp-5">
            <dt>
              <h2 className="font-extrabold tracking-[-0.02em] text-[1.08rem]">{question}</h2>
            </dt>
            <dd className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">{answer}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-cp-7">
        <StartPrintingCta />
      </div>
    </PageShell>
  );
}
