import type { Metadata } from "next";
import type { ComponentType } from "react";
import { PageShell, PageHeader, StartPrintingCta } from "@/components/PageShell";
import {
  CheckIcon,
  LinkIcon,
  ImageIcon,
  TextIcon,
  PrintIcon,
  ClockIcon,
} from "@/components/icons";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    "Everything RecipePrinter does: print recipes from any website, strip out ads, " +
    "save recipes as a PDF, print from a photo or pasted text, and print multiple recipes at once.",
  path: "/features",
});

type Feature = { icon: ComponentType<{ size?: number }>; title: string; body: string };

const FEATURES: Feature[] = [
  {
    icon: CheckIcon,
    title: "Ad-free, clutter-free pages",
    body: "We remove the ads, banners, pop-ups, comments, and the long story above the recipe, leaving a clean page with just the title, ingredients, and steps.",
  },
  {
    icon: LinkIcon,
    title: "Print recipes from any website",
    body: "Paste a URL from the cooking sites you already use and RecipePrinter converts the online recipe into a consistent, printable format.",
  },
  {
    icon: ImageIcon,
    title: "Print from a photo or screenshot",
    body: "Upload a picture of a cookbook page or a screenshot of a recipe and we read the ingredients and steps right out of the image.",
  },
  {
    icon: TextIcon,
    title: "Paste any recipe text",
    body: "Got a recipe from a text, an email, or an unusual site? Paste the raw text and we'll structure it into a clean printable recipe.",
  },
  {
    icon: PrintIcon,
    title: "Save as a PDF",
    body: "Every recipe is rendered as a print-ready, letter-size page, so you can print on paper or choose “Save as PDF” to keep a tidy, ad-free copy.",
  },
  {
    icon: ClockIcon,
    title: "Print multiple recipes at once",
    body: "Build a print queue from different sources, select what you want, and print the whole batch in a single job, ideal for weekly meal prep.",
  },
];

export default function FeaturesPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Features"
        title="A recipe printer built to do one job really well"
        lede="RecipePrinter is free, needs no account, and keeps nothing on a server. It exists to turn cluttered online recipes into pages you can actually cook from. Here's what it does."
      />

      <ul className="grid gap-cp-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="card p-cp-5 flex flex-col gap-cp-3">
            <span className="text-brand">
              <Icon size={22} />
            </span>
            <h2 className="font-extrabold tracking-[-0.02em] text-[1.05rem]">{title}</h2>
            <p className="text-ink-soft text-[0.92rem] leading-relaxed">{body}</p>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="privacy-heading"
        className="mt-cp-7 card p-cp-6 bg-brand-50 border-transparent"
      >
        <h2 id="privacy-heading" className="font-extrabold tracking-[-0.02em] text-[1.1rem]">
          Private by default
        </h2>
        <p className="mt-cp-2 text-ink-soft text-[0.95rem] leading-relaxed">
          There&apos;s no sign-up and nothing is saved to a server. Your print queue lives in your
          browser for the current session only, so the recipes you print stay yours.
        </p>
      </section>

      <div className="mt-cp-7">
        <StartPrintingCta />
      </div>
    </PageShell>
  );
}
