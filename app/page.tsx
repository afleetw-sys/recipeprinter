import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HomeImporter } from "@/components/HomeImporter";
import { ProjectShelf } from "@/components/ProjectShelf";
import { homeJsonLd } from "@/lib/seo";

// The front door, and the only one. Understand what RecipePrinter does, start,
// or pick up something you already have — importing makes a project and carries
// you into it at its own address. Deeper explanations and the FAQ live on their
// own pages (How it works, Features, FAQ, About), linked from the footer.
//
// Server-rendered and statically prerendered: the hero and copy ship as
// crawlable HTML and this page carries the organic search traffic, which is why
// the two things that need the browser — the importer and the shelf — are
// client islands rather than the page itself being a client component.
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

      <main id="rp-main" className="rp-home-main px-cp-6">
        <div className="rp-home">
          {/* What this is, in two sentences. Server-rendered, so it ships as
              crawlable HTML — this page carries the organic search traffic. */}
          <div className="rp-home__intro">
            <h1 className="rp-home__title text-cp-hero font-extrabold tracking-[-0.04em] leading-[1.05]">
              Print the recipes worth making again.
            </h1>
            <p className="rp-home__lede mt-cp-3 text-ink-soft text-cp-body-lg leading-relaxed">
              Turn web and social recipe links into printable recipe cards for your kitchen.
            </p>
          </div>

          {/* Every import method, and nothing after it. Submitting makes a
              project and carries you into it; see components/HomeImporter. */}
          <div className="rp-home-import">
            <HomeImporter />
          </div>

          {/* What you already have. Absent entirely when there is nothing, so
              this never becomes an empty list under an empty form. */}
          <ProjectShelf />
        </div>
      </main>

      <SiteFooter isHome />
    </div>
  );
}
