import Link from "next/link";
import Image from "next/image";
import { FeedbackButton } from "@/components/FeedbackButton";
import { NAV_LINKS, PUBLISHER, SITE_NAME } from "@/lib/seo";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
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
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-cp-small font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              {label}
            </Link>
          ))}
          <FeedbackButton />
          <a
            href={COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ffdd00]/70 bg-white px-cp-3 text-cp-caption font-bold text-ink shadow-cp-xs transition-colors hover:border-[#ffdd00] hover:bg-[#fff9d8]"
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
            for websites, blogs, and social recipes — a{" "}
            <a
              href={PUBLISHER.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-ink hover:underline font-semibold"
            >
              {PUBLISHER.name}
            </a>{" "}
            product.
          </span>
          <span>
            © {new Date().getFullYear()} {PUBLISHER.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
