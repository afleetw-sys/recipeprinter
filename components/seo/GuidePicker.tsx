import Link from "next/link";
import { anchorFor, type SeoLandingPage } from "@/lib/seoLandingPages";

// ─────────────────────────────────────────────────────────────────────────
// A picker, not a link list.
//
// These rendered as the pages' own titles, so a reader asking "how did I find
// this recipe?" got ten cards that mostly began "Print a recipe from…" and had
// to read every one to the end to find the word that differed. The answer to
// the question the heading asks is the platform or the format, so that leads.
//
// The searchable phrase stays as the second line rather than being dropped:
// it is still inside the <a>, so the link keeps telling a crawler what sits on
// the other end, while the reader sees "Pinterest" and stops looking.
// ─────────────────────────────────────────────────────────────────────────

export function GuidePicker({ pages }: { pages: SeoLandingPage[] }) {
  return (
    <ul className="grid gap-cp-3 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((page) => {
        const label = page.shortLabel ?? anchorFor(page);
        const phrase = anchorFor(page);
        return (
          <li key={page.slug}>
            <Link
              href={`/${page.slug}`}
              className="card flex h-full flex-col gap-cp-1 p-cp-4 hover:border-line-strong transition-colors"
            >
              <span className="text-cp-body font-extrabold tracking-[-0.02em] text-ink">
                {label}
              </span>
              {/* Hidden from the reader only when it would repeat the label
                  back at them verbatim. */}
              {phrase.toLowerCase() !== label.toLowerCase() && (
                <span className="text-cp-small leading-snug text-ink-soft">{phrase}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
