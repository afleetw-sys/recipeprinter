import type { Metadata } from "next";
import type { ComponentType } from "react";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import {
  LinkIcon,
  ImageIcon,
  TextIcon,
  CookPilotLogoIcon,
} from "@/components/icons";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "How RecipePrinter Works",
  description:
    "Print recipes from websites, screenshots, photos, or pasted text. RecipePrinter turns recipe URLs into clean printable recipe cards and PDFs with no ads or clutter.",
  path: "/how-it-works",
});

type Source = { 
  icon: ComponentType<{ size?: number }>;
  label: string;
  body: string;
};

const SOURCES: Source[] = [
  {
    icon: LinkIcon,
    label: "Paste a recipe URL",
    body: "Paste a link from a recipe website or food blog and RecipePrinter pulls out the recipe so you can print it without the ads, pop-ups, or extra pages.",
  },
  {
    icon: ImageIcon,
    label: "Upload a photo or screenshot",
    body: "Use a cookbook page, old recipe card, screenshot, or saved image. RecipePrinter reads the recipe and turns it into something clean you can print.",
  },
  {
    icon: TextIcon,
    label: "Paste recipe text",
    body: "Have a recipe from a message, email, document, or site we do not recognize? Paste the text and RecipePrinter will format it into a printable recipe card or page.",
  },
  {
    icon: CookPilotLogoIcon,
    label: "Import from CookPilot",
    body: "Already use CookPilot? Bring your saved recipes into RecipePrinter and add them straight to your print queue.",
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell>
      <PageHeader
        title="From recipe link to printed recipe card"
        lede="RecipePrinter turns recipes from websites, screenshots, photos, and text into clean printable recipe cards and PDFs you can actually cook from."
      />

      <div className="flex flex-col gap-cp-7">
        <section aria-labelledby="step-1">
          <h2
            id="step-1"
            className="text-[1.4rem] font-extrabold tracking-[-0.03em]"
          >
            1. Add a recipe from wherever you found it
          </h2>

          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Start with a recipe you already want to keep. RecipePrinter
            isn&apos;t a recipe discovery app or meal planner. It starts after
            you&apos;ve found something worth making again.
          </p>

          <ul className="mt-cp-4 grid gap-cp-3 sm:grid-cols-2">
            {SOURCES.map(({ icon: Icon, label, body }) => (
              <li key={label} className="card p-cp-5 flex gap-cp-4">
                <span className="text-brand shrink-0 mt-[2px]">
                  <Icon size={20} />
                </span>

                <div>
                  <h3 className="font-bold text-[0.98rem]">{label}</h3>
                  <p className="mt-cp-1 text-ink-soft text-[0.9rem] leading-relaxed">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="step-2">
          <h2
            id="step-2"
            className="text-[1.4rem] font-extrabold tracking-[-0.03em]"
          >
            2. RecipePrinter keeps just the recipe
          </h2>

          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Recipe websites are made for screens, not printers. RecipePrinter
            removes the ads, pop-ups, autoplay videos, comments, oversized
            photos, and extra web page clutter so you can print the part you
            came for.
          </p>

          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            You get a clean recipe with the title, ingredients, instructions,
            notes, prep time, cook time, servings, and other useful details when
            they&apos;re available.
          </p>
        </section>

        <section aria-labelledby="step-3">
          <h2
            id="step-3"
            className="text-[1.4rem] font-extrabold tracking-[-0.03em]"
          >
            3. Print it, save it, or keep a batch for later
          </h2>

          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Preview your recipe as a clean printable recipe card or letter-size
            recipe page, then send it to your printer. You can also choose{" "}
            <span className="font-semibold text-ink">Save as PDF</span> in the
            print dialog to keep a clean recipe PDF on your device.
          </p>

          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            Printing several recipes? Add them to your print queue and print the
            whole batch at once. It works well for a recipe binder, a week of
            dinners, a family cookbook, or the recipes you keep coming back to.
          </p>

          <p className="mt-cp-3 text-ink-soft leading-relaxed">
            No account required. No ads. No clutter. Nothing saved to our
            servers. Just clean printable recipes designed for real kitchens
            instead of web browsers.
          </p>
        </section>

        <div className="pt-cp-2">
          <StartPrintingCta />
        </div>
      </div>
    </PageShell>
  );
}
