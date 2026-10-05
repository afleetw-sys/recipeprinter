import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, CrownIcon, ICON_SIZE } from "@/components/icons";
import { LandingCta, LandingFrame, LandingHero, LandingSection } from "@/components/seo/LandingFrame";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { FaqCards } from "@/components/seo/FaqCards";
import { PricingProButton } from "@/components/seo/PricingProButton";
import { COOKBOOK_PRICE_FALLBACK } from "@/lib/cookbookProduct";
import {
  PRO_ANNUAL_PRICE_FALLBACK,
  PRO_MONTHLY_PRICE_FALLBACK,
  proAnnualSavingsPercent,
} from "@/lib/proProduct";
import { BASIC_BENEFITS, PRO_BENEFITS } from "@/lib/proUpgradeCopy";
import { absoluteUrl, breadcrumbNode, faqJsonLd, pageMetadata } from "@/lib/seo";

// ─────────────────────────────────────────────────────────────────────────────
// What each plan costs and includes, in one place.
//
// The SEO pages name "RecipePrinter Pro" dozens of times and, until this page,
// none of those mentions led anywhere. Every price and both benefit lists are
// read from the same constants the upgrade dialog, /account and checkout use,
// so nothing here can quietly disagree with what someone is actually charged.
// The cookbook list is written here because no shared list of it exists; keep
// it to what lib/cookbookPresets.ts and the export dialog really do.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = pageMetadata({
  title: "RecipePrinter Pricing: Free, Pro, and Cookbooks",
  description:
    "Print full-page recipes free, with no account. RecipePrinter Pro adds 4×6 recipe cards, premium themes, and printing several recipes at once. Cookbooks are a one-time purchase.",
  path: "/pricing",
});

const TRAIL = [
  { name: "Home", href: "/" },
  { name: "Pricing", href: "/pricing" },
];

const COOKBOOK_POINTS = [
  "Your own cover and chapters, with the table of contents built for you",
  "Keep editing after you buy, and export again any time",
  "Print-ready files for home, a copy shop, Lulu, or Blurb",
];

const FAQS = [
  {
    question: "Do I need Pro to print recipes?",
    answer:
      "No. Importing recipes and printing or saving full-page recipes is free, with no account. Pro adds 4×6 recipe cards, premium themes, and printing several recipes in one job.",
  },
  {
    question: "What's the difference between Pro and a cookbook?",
    answer: `Pro is a subscription for everyday printing: cards, themes, and printing in batches. A cookbook is a one-time ${COOKBOOK_PRICE_FALLBACK} purchase for one bound book, and you don't need Pro to buy one. Pro members get 20% off their first cookbook.`,
  },
  {
    question: "Do I need an account?",
    answer:
      "Not to print. Pro needs a free account, so you can manage your subscription from any device.",
  },
  {
    question: "Can I cancel Pro?",
    answer:
      "Yes, any time, from Manage subscription on your account page. Pro stays on until the end of the period you've paid for.",
  },
  {
    question: "What happens to my recipes if Pro ends?",
    answer:
      "Anything you've printed or saved as a PDF is yours to keep. You go back to the free plan: full-page printing, one recipe at a time.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl("/pricing")}#webpage`,
      url: absoluteUrl("/pricing"),
      name: "RecipePrinter Pricing",
      inLanguage: "en",
    },
    breadcrumbNode(TRAIL.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href) }))),
    { ...faqJsonLd(FAQS), "@id": `${absoluteUrl("/pricing")}#faq` },
  ],
};

function PlanList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-cp-4 flex flex-1 flex-col gap-cp-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-cp-2 text-cp-body text-ink-soft">
          <CheckIcon size={ICON_SIZE.sm} className="mt-[4px] shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" href="/" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <LandingHero
        align="centered"
        h1="Pricing"
        lede="Printing recipes is free. Pro adds recipe cards, themes, and printing in batches. Cookbooks are a separate, one-time purchase."
        above={<Breadcrumb trail={TRAIL} />}
      />

      {/* Two plans, side by side. The cookbook is NOT a third column: it is a
          one-time purchase for one book, not a tier above Pro, and as the
          right-hand card of three it read as the most expensive plan. */}
      <section aria-label="Plans" className="mx-auto grid w-full max-w-[56rem] gap-cp-5 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-line bg-card p-cp-6">
          <h2 className="text-cp-h2 font-extrabold text-ink">Free</h2>
          <p className="mt-cp-2 text-cp-body font-bold text-ink-soft">No account needed to print</p>
          <PlanList items={BASIC_BENEFITS} />
          <Link href="/" className="btn btn-secondary mt-cp-6 w-full">
            Start printing
          </Link>
        </div>

        <div className="flex flex-col rounded-2xl border border-line bg-[color-mix(in_srgb,var(--cp-premium-soft)_30%,transparent)] p-cp-6">
          <div className="flex items-center gap-2">
            <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
            <h2 className="text-cp-h2 font-extrabold text-ink">RecipePrinter Pro</h2>
          </div>
          <p className="mt-cp-2 text-cp-body font-bold text-ink">
            {PRO_MONTHLY_PRICE_FALLBACK} or {PRO_ANNUAL_PRICE_FALLBACK}
          </p>
          <p className="text-cp-small text-ink-soft">
            Annual saves {proAnnualSavingsPercent()}%. Cancel any time.
          </p>
          <PlanList items={PRO_BENEFITS} />
          <div className="mt-cp-6">
            <PricingProButton />
          </div>
        </div>
      </section>

      <p className="-mt-cp-5 text-center text-cp-small text-ink-soft">Prices are in US dollars.</p>

      <LandingSection
        id="pricing-cookbook-heading"
        heading="Making a cookbook?"
        lede="Cookbooks are separate from both plans: a one-time purchase for each book you make, on Free or Pro."
      >
        <div className="grid gap-cp-5 rounded-2xl border border-line bg-card p-cp-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-cp-body font-bold text-ink">
              {COOKBOOK_PRICE_FALLBACK} per cookbook, paid once
            </p>
            <PlanList items={COOKBOOK_POINTS} />
          </div>
          <Link href="/make-your-own-cookbook" className="btn btn-secondary">
            How cookbooks work
          </Link>
        </div>
        <p className="mt-cp-3 text-cp-small text-ink-soft">
          Printing the finished book is paid to the printer you choose.
        </p>
      </LandingSection>

      <LandingSection id="pricing-faq-heading" heading="Questions about pricing">
        <FaqCards items={FAQS} />
      </LandingSection>
    </LandingFrame>
  );
}
