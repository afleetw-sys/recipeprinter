import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PrinterWorkspace } from "@/components/PrinterWorkspace";
import { CommunityGallery } from "@/components/CommunityGallery";
import { homeJsonLd } from "@/lib/seo";

// The homepage is a focused utility: understand what RecipePrinter does and
// start printing without scrolling past marketing. Deeper explanations and the
// FAQ live on their own pages (How it works, Features, FAQ, About), linked from
// the footer. Server-rendered, so the hero and copy ship as crawlable HTML.
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Structured data describing the product itself. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()) }}
      />

      <a
        href="#rp-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:rounded-lg focus:border focus:border-line-strong focus:bg-card focus:px-cp-4 focus:py-cp-2"
      >
        Skip to the recipe printer
      </a>

      <SiteHeader />

      <main id="rp-main" className="flex-1 px-cp-6">
        {/* One column, centred, shared by everything on the page. It used to be
            the full 1240px with each block finding its own width inside it,
            which was fine while the importer had a print list beside it filling
            the rest of the row. With the list gone (see PrinterWorkspace) that
            left a narrow card floating left of a wide page. */}
        <div className="max-w-home mx-auto flex flex-col pt-cp-6 sm:pt-cp-7 pb-cp-7">
          {/* The front door proper, centred in what's left of the screen after
              the top bar, with only enough height reserved to leave a slice of
              the kitchen strip showing underneath. A visitor gets one thing to
              do and a reason to keep scrolling, rather than two blocks of equal
              claim stacked at the top of a tall page. */}
          <div className="rp-home-frontdoor flex flex-col justify-center gap-cp-7">
          {/* Hero: what it does and why it's useful, in two sentences. */}
          <div className="rp-landing-hero w-full">
            {/* No max-width of its own: the column above is the measure now, so
                the headline breaks on the same edge the card below it ends on. */}
            <h1 className="text-cp-hero font-extrabold tracking-[-0.04em] leading-[1.05]">
              Print the recipes worth making again.
            </h1>
            <p className="mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">
              Turn web and social recipe links into printable recipe cards for your kitchen.
            </p>
          </div>

          {/* The tool itself (interactive, client). It no longer finishes
              imports started on an SEO landing page: those hand off straight to
              /print now, where the printed card is. */}
          <PrinterWorkspace />
          </div>

          {/* Below the tool, never above it: what other people printed is an
              argument for staying, not the reason a visitor came. Renders
              nothing at all until there are photographs to show. */}
          <CommunityGallery />
        </div>
      </main>

      <SiteFooter isHome />
    </div>
  );
}
