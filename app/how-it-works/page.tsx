import type { Metadata } from "next";
import type { ComponentType } from "react";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import { LinkIcon, ImageIcon, TextIcon, CookPilotLogoIcon, PrintIcon } from "@/components/icons";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "How it works",
  description:
    "See how RecipePrinter turns a recipe URL, photo, or pasted text into a clean, " +
    "printable page with no ads — in three simple steps.",
  path: "/how-it-works",
});

type Source = { icon: ComponentType<{ size?: number }>; label: string; body: string };

const SOURCES: Source[] = [
  {
    icon: LinkIcon,
    label: "A website URL",
    body: "Paste the link to a recipe and we fetch the page and read the recipe out of it — the fastest way to print a recipe from a website.",
  },
  {
    icon: ImageIcon,
    label: "A photo or screenshot",
    body: "Snap a cookbook page or screenshot a recipe and upload it. We read the ingredients and steps straight from the image.",
  },
  {
    icon: TextIcon,
    label: "Pasted text",
    body: "Copied a recipe from a message, email, or a site we don't recognize? Paste the raw text and we'll structure it for you.",
  },
  {
    icon: CookPilotLogoIcon,
    label: "Your CookPilot recipes",
    body: "Already use CookPilot? Pull recipes you've saved there straight into your print queue.",
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="How it works"
        title="From a cluttered web page to a clean printed recipe"
        lede="RecipePrinter does one thing well: it takes a recipe from wherever it lives online and gives you a tidy page you can cook from. Here's exactly what happens between paste and print."
      />

      <div className="flex flex-col gap-cp-7">
        <section aria-labelledby="step-1">
          <h2 id="step-1" className="text-[1.4rem] font-extrabold tracking-[-0.03em]">
            1. Add a recipe from any source
          </h2>
          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Start by getting the recipe into RecipePrinter. There are four ways, so a recipe can
            come from almost anywhere:
          </p>
          <ul className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
            {SOURCES.map(({ icon: Icon, label, body }) => (
              <li key={label} className="card p-cp-5 flex gap-cp-4">
                <span className="text-brand shrink-0 mt-[2px]">
                  <Icon size={20} />
                </span>
                <div>
                  <h3 className="font-bold text-[0.98rem]">{label}</h3>
                  <p className="mt-cp-1 text-ink-soft text-[0.9rem] leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="step-2">
          <h2 id="step-2" className="text-[1.4rem] font-extrabold tracking-[-0.03em]">
            2. We strip everything that isn&apos;t the recipe
          </h2>
          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Modern recipe pages bury the food under ads, pop-ups, newsletter prompts, comments, and
            a long personal story. RecipePrinter throws all of that away and keeps only what you
            cook from: the title, ingredients, steps, and useful details like prep and cook time,
            servings, and yield. The result is a clean, ad-free recipe — the way it would look on a
            recipe card.
          </p>
        </section>

        <section aria-labelledby="step-3">
          <h2 id="step-3" className="text-[1.4rem] font-extrabold tracking-[-0.03em]">
            3. Print it, or save it as a PDF
          </h2>
          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Preview a tidy, letter-size page and send it to your printer. Prefer a digital copy?
            Choose <span className="font-semibold text-ink">Save as PDF</span> in the print dialog
            to keep a clean recipe PDF on your device. Adding several recipes first? Select them all
            and print the whole batch in one job — handy when you&apos;re planning a week of meals.
          </p>
          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Nothing is stored on a server and no account is needed. Your print queue lives in your
            browser for the session, then it&apos;s gone.
          </p>
        </section>

        <div className="pt-cp-2">
          <StartPrintingCta />
        </div>
      </div>
    </PageShell>
  );
}
