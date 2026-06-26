import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PrinterWorkspace } from "@/components/PrinterWorkspace";
import { webApplicationJsonLd } from "@/lib/seo";

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd()) }}
      />

      <a
        href="#rp-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:rounded-lg focus:bg-card focus:px-cp-4 focus:py-cp-2 focus:shadow"
      >
        Skip to the recipe printer
      </a>

      <SiteHeader />

      <main id="rp-main" className="flex-1 px-cp-6">
        <div className="max-w-queue mx-auto flex flex-col gap-cp-7 pt-cp-6 sm:pt-cp-7 pb-cp-7">
          {/* Hero — what it does and why it's useful, in two sentences. */}
          <div className="max-w-panel">
            <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-extrabold tracking-[-0.04em] leading-[1.05]">
              Print any recipe
              <br />
              without the clutter.
            </h1>
            <p className="mt-cp-3 text-ink-soft text-[1.02rem] leading-relaxed">
              RecipePrinter turns any online recipe into a clean, printable page. Paste a recipe
              URL, upload a photo, or paste recipe text — we strip the ads and clutter and give you
              a letter-size recipe you can print or save as a PDF in seconds.
            </p>
          </div>

          {/* The tool itself (interactive, client). */}
          <PrinterWorkspace />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
