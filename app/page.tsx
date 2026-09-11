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
        {/* Two measures, on purpose. The front door is a narrow centred column
            because it is one thing to read and one thing to do; the kitchen
            strip below runs to the full page width because it is a band of
            photographs, and the change of width is what says the two are
            different kinds of thing. The footer takes the wider one, so the
            page ends on the measure it ended the content with. */}
        <div className="max-w-home mx-auto flex flex-col pt-cp-6 sm:pt-cp-7">
          {/* The front door proper: one thing to read and one thing to do. It
              starts at a fixed offset below the top bar and is otherwise as
              tall as its contents. See `.rp-home-frontdoor` for why it is
              neither centred nor holding a reserved height. */}
          <div className="rp-home-frontdoor flex flex-col gap-cp-7">
          {/* Hero: what it does and why it's useful, in two sentences.
              Centred over the card rather than ranged left against it. Both
              lines are shorter than the column, so left-ranging left a lot of
              empty space to the right of each one and the block read as
              unfinished beside the full-width card underneath. */}
          <div className="rp-landing-hero w-full text-center">
            {/* No max-width of its own: the column above is the measure, so a
                headline long enough to wrap does it on the same edges the card
                below ends on. */}
            <h1 className="text-cp-hero font-extrabold tracking-[-0.04em] leading-[1.05]">
              Print the recipes{" "}
              {/* Clay type. docs/color-roles.md gives everything
                  non-interactive that should catch the eye to clay, and this
                  is a phrase to look at rather than a thing to click.
                  Clay on this background is 3.44:1, which is under the 4.5:1
                  body text answers to and over the 3:1 that LARGE text does.
                  This headline is 800 weight at 44px on a desktop and 28px on
                  a phone, both well past the 18.66px bold that counts as
                  large, so it holds here and nowhere smaller. The
                  design-system audit bans clay as a word outright because that
                  is the right default; this one line is allowlisted there, by
                  its exact text, with the same reasoning. */}
              <span className="text-[var(--cp-accent-warm)]">worth making again.</span>
            </h1>
            {/* Its own measure, narrower than the headline's: centred text is
                read by finding the start of each line, and the full 860px
                column is a long way to track back across.
                38rem, not 34: the sentence wants 562px to sit on one line and
                34rem gave it 544, so it wrapped and left "kitchen." alone on a
                line of its own. The cap is here to keep a LONGER subhead
                readable, not to break this one. */}
            {/* `text-cp-body` up to `sm`, the larger lede size above it. The
                headline drops 37% between a desktop and a phone (44px to 28px)
                while `--cp-fs-body-lg` drops 8%, so on a phone the two sizes
                closed to within 1.85x of each other and the subtitle read
                nearly as loud as the thing it is subordinate to. */}
            <p className="mt-cp-3 mx-auto max-w-[38rem] text-ink-soft text-cp-body sm:text-cp-body-lg leading-relaxed">
              Turn web and social recipe links into printable recipe cards for your kitchen.
            </p>
          </div>

          {/* The tool itself (interactive, client). It no longer finishes
              imports started on an SEO landing page: those hand off straight to
              /print now, where the printed card is. */}
          <PrinterWorkspace />
          </div>
        </div>

        {/* Below the tool, never above it: what other people printed is an
            argument for staying, not the reason a visitor came. Renders
            nothing at all until there are photographs to show. */}
        <div className="max-w-content mx-auto pb-cp-7">
          <CommunityGallery />
        </div>
      </main>

      <SiteFooter isHome />
    </div>
  );
}
