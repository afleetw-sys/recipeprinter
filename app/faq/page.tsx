import type { Metadata } from "next";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { faqJsonLd, pageMetadata } from "@/lib/seo";

const FAQ = [
  {
    question: "Can I print recipes from any website?",
    answer:
      "Usually, yes. Paste a recipe URL from a recipe website or food blog and RecipePrinter will turn it into a clean printable recipe card or page. If a site does not import cleanly, you can paste the recipe text directly or upload a screenshot instead.",
  },
  {
    question: "Can I print recipes without ads?",
    answer:
      "Yes. RecipePrinter removes ads, pop-ups, autoplay videos, comments, oversized photos, and other web page clutter so you can print just the recipe: ingredients, instructions, notes, and useful details when available.",
  },
  {
    question: "Can I save recipes as PDFs?",
    answer:
      "Yes. Every recipe is formatted as a print-ready page, so you can print it on paper or choose Save as PDF in your browser’s print dialog to keep a clean recipe PDF on your device.",
  },
  {
    question: "Can I print recipes from screenshots or photos?",
    answer:
      "Yes. Upload a screenshot, cookbook page, old recipe card, or saved image and RecipePrinter will read the recipe and format it into a printable version.",
  },
  {
    question: "Can I paste recipe text instead of using a URL?",
    answer:
      "Yes. If you have a recipe from a text message, email, document, or website that does not import cleanly, paste the recipe text directly and RecipePrinter will structure it into a printable recipe card or page.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. RecipePrinter works without an account, so you can paste a recipe, print it, save it as a PDF, and move on.",
  },
  {
    question: "Are my recipes stored on your servers?",
    answer:
      "No. Your print queue lives in your browser for the current session only and is not stored permanently on our servers.",
  },
  {
    question: "Is RecipePrinter free?",
    answer: "Yes. RecipePrinter is free to use.",
  },
  {
    question: "Is RecipePrinter a recipe app?",
    answer:
      "Not really. RecipePrinter is not a recipe discovery app, meal planner, grocery app, nutrition tracker, or social network. It is built for what happens after you have already found a recipe worth making again.",
  },
  {
    question: "What is the difference between CookPilot and RecipePrinter?",
    answer:
      "CookPilot helps make recipes work for real life with substitutions, notes, adjustments, and cooking tools. RecipePrinter solves a simpler problem: getting recipes off the screen and into your kitchen. You can use RecipePrinter on its own or import recipes from CookPilot.",
  },
  {
    question: "Why print recipes instead of cooking from a screen?",
    answer:
      "Because cooking and screens do not always get along. Printed recipes do not lock, dim, run out of battery, disappear under notifications, or make you scroll with messy hands.",
  },
];

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Answers about printing recipes from websites, removing ads, saving recipes as PDFs, printing from screenshots and photos, using CookPilot, and RecipePrinter privacy.",
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
        lede="Answers about printing recipes from websites, screenshots, photos, and text without the ads, clutter, or wasted pages."
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
