import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark, Wordmark } from "@/components/Logo";
import { ChevronLeftIcon, ICON_SIZE } from "@/components/icons";

// Minimal top bar shared across every page, mirrors CookPilot's cp-topbar.
// The logo is a home link so the product always feels like one focused utility,
// not a sprawling marketing site. Navigation lives in the footer.
export function SiteHeader({
  backHref,
  onBack,
  actions,
  centerActions = false,
  compact = false,
  sticky = false,
}: {
  backHref?: string;
  /** When set, the logo becomes a real "go back" control (history.back()) instead of a fixed link to backHref/home. */
  onBack?: () => void;
  actions?: ReactNode;
  /** Center `actions` in the bar (absolute) rather than right-aligning them. */
  centerActions?: boolean;
  compact?: boolean;
  sticky?: boolean;
}) {
  const logo = (
    <>
      {(backHref || onBack) && (
        <span className="text-ink-soft group-hover:text-ink transition-colors" aria-hidden>
          <ChevronLeftIcon size={ICON_SIZE.md} />
        </span>
      )}
      <LogoMark size={compact ? 26 : 30} rounded={0} />
      <Wordmark
        className={`${
          compact
            ? "text-[length:var(--cp-fs-wordmark-compact)]"
            : "text-[length:var(--cp-fs-wordmark)]"
        } text-ink`}
      />
    </>
  );

  return (
    <header
      className={`no-print relative flex items-center justify-between gap-cp-4 px-cp-6 min-h-[62px] flex-wrap ${
        sticky ? "sticky top-0 z-10 bg-page border-b border-line py-cp-3" : ""
      }`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-cp-3 group bg-transparent border-0 p-0 cursor-pointer"
          aria-label="Back"
        >
          {logo}
        </button>
      ) : (
        <Link
          href={backHref ?? "/"}
          className="flex items-center gap-cp-3 group"
          aria-label="RecipePrinter home"
        >
          {logo}
        </Link>
      )}
      {actions &&
        (centerActions ? (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-cp-3">
            {actions}
          </div>
        ) : (
          <div className="flex items-center gap-cp-3 flex-wrap justify-end">{actions}</div>
        ))}
    </header>
  );
}
