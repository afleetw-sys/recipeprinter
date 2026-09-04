import Link from "next/link";
import Image from "next/image";
import { FeedbackButton } from "@/components/FeedbackButton";
import { LEGAL_LINKS, NAV_LINKS, SITE_NAME } from "@/lib/seo";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const CONTACT_EMAIL = "recipeprinter@goodproblem.studio";
const COFFEE_LOGO_SRC = "/images/buy-me-a-coffee-logo.png";

// Shared footer + primary site navigation. Keeping the deeper pages here (rather
// than in the header) is what lets the homepage stay a clean utility while the
// supporting content stays one click away and fully crawlable.
export function SiteFooter({ isHome = false }: { isHome?: boolean }) {
  return (
    <footer className="no-print mt-cp-7 border-t border-line px-cp-6 py-cp-6">
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
          <a
            href={COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ffdd00]/70 bg-white px-cp-3 text-cp-caption font-bold text-ink transition-colors hover:border-[#ffdd00] hover:bg-[#fff9d8]"
          >
            <Image
              src={COFFEE_LOGO_SRC}
              alt=""
              aria-hidden="true"
              width={20}
              height={20}
              className="h-5 w-5 rounded-full"
            />
            Support RecipePrinter
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
                className="font-semibold hover:text-ink transition-colors"
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
