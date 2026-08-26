import type { Metadata } from "next";
import { PageShell, PageHeader, ClosingAction } from "@/components/PageShell";
import { FaqAnswer } from "@/components/seo/FaqAnswer";
import { FAQ, faqJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "RecipePrinter FAQ",
  description:
    "Answers about printing recipes from websites, URLs, Pinterest, Instagram, TikTok, PDFs, recipe cards, binders, and privacy.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <PageShell crumb="FAQ" path="/faq">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />

      <PageHeader
        title="Frequently asked questions"
        lede="Answers about printing recipes from websites, URLs, social posts, screenshots, photos, and text as printable cards, pages, and PDFs."
      />

      {/* The landing pages' FAQ treatment, so the same question looks the same
          wherever it is answered. */}
      <dl className="grid gap-cp-4">
        {FAQ.map(({ question, answer }, index) => (
          <div key={question} className="rounded-2xl border border-line bg-card p-cp-5">
            <dt className="flex items-start gap-cp-3 text-cp-body-lg font-extrabold leading-snug tracking-[-0.02em]">
              <span
                className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--cp-accent-soft)] text-cp-small font-black text-[var(--cp-accent-ink)]"
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="pt-1">{question}</span>
            </dt>
            <dd className="mt-cp-3 border-t border-line pt-cp-3 text-ink-soft text-cp-body leading-relaxed">
              <FaqAnswer answer={answer} />
            </dd>
          </div>
        ))}
      </dl>

      <ClosingAction />
    </PageShell>
  );
}
