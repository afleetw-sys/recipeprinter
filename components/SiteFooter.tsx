import Link from "next/link";
import { FeedbackButton } from "@/components/FeedbackButton";
import { LEGAL_LINKS, NAV_LINKS, SITE_NAME } from "@/lib/seo";

const CONTACT_EMAIL = "recipeprinter@goodproblem.studio";

// Shared footer + primary site navigation. Keeping the deeper pages here (rather
// than in the header) is what lets the homepage stay a clean utility while the
// supporting content stays one click away and fully crawlable.
export function SiteFooter({ isHome = false }: { isHome?: boolean }) {
  return (
    <footer className="no-print mt-cp-7 border-t border-line px-cp-6 py-cp-6">
      {/* One measure everywhere, and on the homepage it is the one the kitchen
          strip directly above it uses. The narrow `max-w-home` column belongs
          to the front door alone: a footer set to it sat visibly inside the
          band of photographs it follows. */}
      <div className="max-w-content mx-auto w-full flex flex-col gap-cp-5">
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-cp-6 gap-y-cp-3"
        >
          {NAV_LINKS.filter((link) => link.inFooter !== false).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-cp-small font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              {label}
            </Link>
          ))}
          <FeedbackButton />
          {/* Feedback goes in a form we read in aggregate; this is the way to
              reach a person about one specific thing. Both belong here, next to
              each other, so neither is the only door. */}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-cp-small font-semibold text-ink-soft hover:text-ink transition-colors"
          >
            Contact us
          </a>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-cp-3 text-cp-caption text-ink-soft">
          <span>
            {SITE_NAME} is a free{" "}
            {isHome ? (
              "recipe printer"
            ) : (
              <Link href="/" className="text-brand-ink hover:underline font-semibold">
                recipe printer
              </Link>
            )}{" "}
            for websites, blogs, and social recipes.
          </span>
          {/* Legal links ride with the copyright rather than in the nav row
              above: it is the line a reader already scans for them, and it
              keeps the row above about the pages we want people to read. */}
          <span className="flex flex-wrap items-center gap-x-cp-4 gap-y-cp-2">
            {LEGAL_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                // `text-ink-soft` is explicit rather than inherited from the
                // row: the base `a` rule in globals.css sets the accent colour,
                // and an element's own rule beats a colour inherited from its
                // parent, so these two rendered cornflower beside a row of soft
                // grey links. Same classes as the nav links above, minus the
                // size, which is the caption scale down here.
                className="font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                {label}
              </Link>
            ))}
            <span>
              © {new Date().getFullYear()} {SITE_NAME}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
