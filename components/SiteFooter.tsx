import Link from "next/link";
import { NAV_LINKS, PUBLISHER, SITE_NAME } from "@/lib/seo";

// Shared footer + primary site navigation. Keeping the deeper pages here (rather
// than in the header) is what lets the homepage stay a clean utility while the
// supporting content stays one click away and fully crawlable.
export function SiteFooter() {
  return (
    <footer className="no-print mt-cp-7 border-t border-line px-cp-6 py-cp-6">
      <div className="max-w-content mx-auto w-full flex flex-col gap-cp-5">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-cp-6 gap-y-cp-3">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-[0.9rem] font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-cp-3 text-[0.8rem] text-ink-soft">
          <span>
            {SITE_NAME} is a{" "}
            <a
              href={PUBLISHER.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline font-semibold"
            >
              {PUBLISHER.name}
            </a>{" "}
            product
          </span>
          <span>
            © {new Date().getFullYear()} {PUBLISHER.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
