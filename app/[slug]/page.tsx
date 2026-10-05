import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  LandingCta,
  LandingFrame,
  LandingHero,
  SectionHeading,
} from "@/components/seo/LandingFrame";
import { SeoCapture } from "@/components/seo/SeoCapture";
import { Breadcrumb, type Crumb } from "@/components/seo/Breadcrumb";
import { cookbookPitchFeature } from "@/components/seo/CookbookPitch";
import { RecipeBinderSections } from "@/components/seo/RecipeBinderSections";
import { heroCardKey } from "@/lib/seoImages";
import {
  ComparisonTable,
  FeatureRows,
  HeroProductPhoto,
  HowItWorks,
  PhotoGallery,
} from "@/components/seo/LandingVisuals";
import { FaqCards } from "@/components/seo/FaqCards";
import { PickerRow } from "@/components/seo/PickerRow";
import {
  SEO_LANDING_PAGE_MAP,
  SEO_LANDING_PAGES,
  layoutForPage,
  seoLandingPageMetadata,
  type SeoLandingPage,
} from "@/lib/seoLandingPages";
import { absoluteUrl, breadcrumbNode, howToNode } from "@/lib/seo";

type PageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return SEO_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) return {};
  return seoLandingPageMetadata(page);
}

// Home › [Page] — a 2-level trail, like Canva's create pages.
function breadcrumbTrail(page: SeoLandingPage): Crumb[] {
  return [
    { name: "Home", href: "/" },
    { name: page.breadcrumbLabel ?? page.h1, href: `/${page.slug}` },
  ];
}

function pageJsonLd(page: SeoLandingPage) {
  const url = absoluteUrl(`/${page.slug}`);
  const trail = breadcrumbTrail(page);
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
      breadcrumbNode(trail.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.href ?? "/") }))),
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: page.faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
      ...(page.howTo && page.howTo.length > 0 ? [howToNode(page.title, page.howTo)] : []),
    ],
  };
}

function CaptureBlock({ page }: { page: SeoLandingPage }) {
  return (
    <div id="rp-capture" className="scroll-mt-24">
      <SeoCapture
        initialMode={page.initialImportMode ?? "url"}
        submitLabel={page.importSubmitLabel ?? "Start printing"}
        fieldLabel={page.importFieldLabel}
        placeholder={page.importPlaceholder}
        uploadTitle={page.importUploadTitle}
        modes={page.importModes}
      />
      {/* Off by default — see the field's own doc comment. Full-contrast,
          deliberately NOT the muted caption weight ImportPanel's own inline
          notes use (the "Works with Instagram…" line under the URL field,
          an error) — this is pricing/access context, not another usage
          tip, and reading as one more line in that same quiet grey stream
          buried it. The weight alone is enough to tell the two apart; it
          sits right under the component rather than needing extra distance
          from it too. */}
      {page.captureReassurance && (
        <p className="mt-cp-3 text-cp-small font-semibold text-ink">{page.captureReassurance}</p>
      )}
      {page.importHint && (
        <p className={`${page.captureReassurance ? "mt-cp-2" : "mt-cp-3"} text-cp-small text-ink-soft`}>
          {page.importHint}
        </p>
      )}
    </div>
  );
}

type PhraseLink = { phrase: string; href: string };

/** `text` with the first occurrence of each phrase linked. */
function withLinks(text: string, links: PhraseLink[] | undefined): ReactNode {
  const hits = (links ?? [])
    .map((link) => ({ ...link, at: text.indexOf(link.phrase) }))
    .filter((link) => link.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (hits.length === 0) return text;
  const parts: ReactNode[] = [];
  let from = 0;
  for (const hit of hits) {
    if (hit.at < from) continue;
    parts.push(text.slice(from, hit.at));
    parts.push(
      <Link key={hit.href} href={hit.href} className="font-bold text-ink hover:underline">
        {hit.phrase}
      </Link>,
    );
    from = hit.at + hit.phrase.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

export default function SeoLandingPage({ params }: PageProps) {
  const page = SEO_LANDING_PAGE_MAP.get(params.slug);
  if (!page) notFound();

  const isGuide = layoutForPage(page) === "guide-first";
  // The full Link/Recipe apps/Image/Text switch runs taller AND wider than
  // the single field every other page shows, and its height changes as the
  // mode does — plain CSS centering (the hero grid's default) re-litigated
  // the photo's position on every tab. `center-once` (see HeroSplitRow)
  // measures once after mount instead, so the photo still reads centered but
  // stops moving when the mode does. The slightly wider copy column keeps the
  // toggle and field comfortable without reducing the photo to a thumbnail.
  // Its fixed 4:3 crop gives even very wide source art the same visual weight
  // as the other hero photos without moving the controls farther down.
  const showsAllImportModes = (page.importModes?.length ?? 0) > 1;
  const usesDecorativePdf = page.slug === "convert-recipe-to-pdf";
  // The cookbook pitch is the last feature row, so it keeps the left/right
  // alternation going (see CookbookPitch).
  const features = [
    ...(page.featureSections ?? []).map((feature) => ({
      ...feature,
      body: withLinks(feature.body, feature.links),
      afterBody: [feature.afterBody ?? []].flat().map((p) => withLinks(p, feature.links)),
    })),
    ...(page.cookbookPitch
      ? [
          cookbookPitchFeature({
            heading: page.cookbookPitchHeading,
            body: page.cookbookPitchBody,
            link: page.cookbookPitchLink,
          }),
        ]
      : []),
  ];

  return (
    <LandingFrame headerActions={<LandingCta label="Go to printer" compact />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd(page)) }}
      />

      <LandingHero
        h1={page.h1}
        lede={page.lede}
        above={<Breadcrumb trail={breadcrumbTrail(page)} />}
        note={page.statusNote}
        asideAlign={usesDecorativePdf ? "start" : showsAllImportModes ? "center-once" : undefined}
        asideWidth={usesDecorativePdf ? "small-aside" : showsAllImportModes ? "narrow" : undefined}
        verticalPadding={usesDecorativePdf ? "roomy" : undefined}
        actions={
          isGuide ? (
            // No "See how it works" link beside it. On a guide-first page the
            // how-to section is the next thing on the screen, with nothing
            // between it and the hero, so the link scrolled you to something
            // you could already see.
            <LandingCta label={page.importSubmitLabel ?? "Start your cookbook"} />
          ) : (
            <CaptureBlock page={page} />
          )
        }
        aside={
          <div
            className={
              usesDecorativePdf
                ? "mx-auto w-full max-w-[280px] -rotate-[3deg] lg:-translate-y-cp-3"
                : undefined
            }
          >
            <HeroProductPhoto
              imageKey={page.heroImage}
              imageAlt={page.heroImageAlt}
              cardKey={heroCardKey(page)}
              // The two defaults describe the CARD photos, which is what
              // the hero was before a page could name its own. A page that
              // names one is showing something else, so it captions it or
              // says nothing.
              annotation={
                page.heroImage
                  ? page.heroAnnotation
                  : isGuide
                    ? "Ready for a family cookbook"
                    : "Printed from a recipe link"
              }
              priority
              wide={usesDecorativePdf || !showsAllImportModes}
              crop={showsAllImportModes && !usesDecorativePdf}
              frame={page.heroFrame}
            />
          </div>
        }
      />

      {page.hub && (
        <PickerRow
          label={page.hub.label}
          pages={page.hub.slugs.flatMap((slug) => SEO_LANDING_PAGE_MAP.get(slug) ?? [])}
        />
      )}

      {/* Straight after the hero on a comparison page. Someone who searched
          for a competitor's name came to see the two side by side, so the
          table is the answer to their question, not a footnote below three
          feature sections arguing for one of the columns. */}
      {page.comparison && (
        <section aria-labelledby="comparison-heading">
          <div id="comparison-heading">
            <SectionHeading>
              RecipePrinter and {page.comparison.competitor}, side by side
            </SectionHeading>
          </div>
          <div className="mt-cp-6">
            <ComparisonTable
              competitor={page.comparison.competitor}
              groups={page.comparison.groups}
            />
          </div>
        </section>
      )}

      {page.howTo && page.howTo.length > 0 && (
        <section aria-labelledby="howto-heading">
          <div id="howto-heading">
            <SectionHeading>{page.howToHeading ?? "How it works"}</SectionHeading>
          </div>
          {page.intro && (
            <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">{page.intro}</p>
          )}
          <div className="mt-cp-6">
            <HowItWorks steps={page.howTo} />
          </div>
        </section>
      )}

      {features.length > 0 && (
        <section aria-label="Features">
          <FeatureRows features={features} />
        </section>
      )}

      {isGuide && (
        <section className="border-y border-line py-[64px]" aria-labelledby="guide-capture-heading">
          <div className="grid gap-cp-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-center lg:gap-[88px]">
            <div>
              <h2 id="guide-capture-heading" className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
                {page.captureHeading ?? "Start here"}
              </h2>
            </div>
            <CaptureBlock page={page} />
          </div>
        </section>
      )}

      {page.slug === "recipe-binder" && <RecipeBinderSections />}

      {page.examples && page.examples.length > 0 && (
        <section aria-labelledby="examples-heading">
          <div id="examples-heading">
            <SectionHeading>Real cards, really printed</SectionHeading>
          </div>
          <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
            {page.examplesSubtitle ?? "Actual recipe cards printed with RecipePrinter, no mockups."}
          </p>
          <div className="mt-cp-6">
            <PhotoGallery cardKeys={page.examples} />
          </div>
        </section>
      )}

      {page.slug === "digitize-recipe-cards" && (
        <section aria-label="Digitize a family recipe collection">
          <FeatureRows
            features={[
              {
                heading: "Digitize one recipe card or a whole family collection",
                image: "card",
                body:
                  "Start with a single favorite or work through an inherited recipe box a few cards at a time. Once the recipes are digitized, you can give them a consistent format even when the originals use different card sizes, handwriting styles, or layouts.",
                afterBody:
                  "You can print individual recipes as you go, or use RecipePrinter Pro when you want to work with and print multiple recipes together.",
              },
            ]}
          />
        </section>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-heading">
        <div id="faq-heading">
          <SectionHeading>{page.faqHeading}</SectionHeading>
        </div>
        <div className="mt-cp-5">
          <FaqCards
            items={page.faqs.map((item) => ({
              question: item.question,
              answer:
                item.answerEmphasis && item.answer.includes(item.answerEmphasis) ? (
                  <>
                    {item.answer.slice(0, item.answer.indexOf(item.answerEmphasis))}
                    <strong>{item.answerEmphasis}</strong>
                    {item.answer.slice(item.answer.indexOf(item.answerEmphasis) + item.answerEmphasis.length)}
                  </>
                ) : (
                  item.answer
                ),
              links: item.links,
            }))}
          />
        </div>
      </section>

      {/* ── Related ───────────────────────────────────────────────────── */}
      <section aria-labelledby="related-heading">
        <div id="related-heading">
          <SectionHeading>More ways to use RecipePrinter</SectionHeading>
        </div>
        <div className="mt-cp-4 flex flex-wrap gap-cp-3">
          {page.links.map((link) => (
            <Link key={link.href} href={link.href} className="btn btn-secondary btn-compact">
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </LandingFrame>
  );
}
