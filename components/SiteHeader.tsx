import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark, Wordmark } from "@/components/Logo";

// Minimal top bar shared across every page, mirrors CookPilot's cp-topbar.
// The logo is a home link so the product always feels like one focused utility,
// not a sprawling marketing site. Navigation lives in the footer.
export function SiteHeader({
  backHref,
  actions,
  compact = false,
  sticky = false,
}: {
  backHref?: string;
  actions?: ReactNode;
  compact?: boolean;
  sticky?: boolean;
}) {
  return (
    <header
      className={`no-print flex items-center justify-between gap-cp-4 px-cp-6 min-h-[62px] flex-wrap ${
        sticky ? "sticky top-0 z-10 bg-page border-b border-line py-cp-3" : ""
      }`}
    >
      <Link
        href={backHref ?? "/"}
        className="flex items-center gap-cp-3 group"
        aria-label="RecipePrinter home"
      >
        {backHref && (
          <span className="text-ink-soft group-hover:text-ink transition-colors" aria-hidden>
            ←
          </span>
        )}
        <LogoMark size={compact ? 26 : 30} rounded={0} />
        <Wordmark className={`${compact ? "text-[1.05rem]" : "text-[1.2rem]"} text-ink`} />
      </Link>
      {actions && (
        <div className="flex items-center gap-cp-3 flex-wrap justify-end">{actions}</div>
      )}
    </header>
  );
}
