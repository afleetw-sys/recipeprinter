import { HomeLink } from "@/components/HomeLink";
import type { ReactNode } from "react";
import { LogoMark, Wordmark } from "@/components/Logo";
import { AccountControl, type AccountSaveStatus } from "@/components/AccountControl";

// Minimal top bar shared across every page, mirrors CookPilot's cp-topbar.
// The logo is a home link so the product always feels like one focused utility,
// not a sprawling marketing site. Navigation lives in the footer.
export function SiteHeader({
  backHref,
  actions,
  centerActions = false,
  compact = false,
  sticky = false,
  saveStatus,
  onRetrySave,
  onSave,
  center,
  onNavigateHome,
}: {
  backHref?: string;
  actions?: ReactNode;
  /** Center `actions` in the bar (absolute) rather than right-aligning them.
      Superseded by `center`, which lets a page have both. */
  centerActions?: boolean;
  /** Centred on the page, independent of `actions`. The workspace puts the
      project's title and what kind of document it is here — the two facts that
      say WHICH thing you are looking at, which belong in the middle rather
      than queued up with the controls that act on it. */
  center?: ReactNode;
  compact?: boolean;
  sticky?: boolean;
  saveStatus?: AccountSaveStatus | null;
  onRetrySave?: () => void;
  onSave?: () => void;
  /** Intercepts the logo's navigation home. Given by the workspace, which puts
      the open project away (and animates it going) before it leaves, and owns
      the push itself. */
  onNavigateHome?: () => void;
}) {
  const logo = (
    <>
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
      className={`no-print relative flex items-center justify-between gap-cp-3 sm:gap-cp-4 px-cp-4 sm:px-cp-6 min-h-[62px] flex-nowrap ${
        sticky ? "sticky top-0 z-10 bg-card border-b border-line py-cp-3" : ""
      }`}
    >
      <HomeLink href={backHref ?? "/"} onNavigateHome={onNavigateHome}>
        {logo}
      </HomeLink>
      {/* Centred on the PAGE, not between its neighbours — absolutely
          positioned so the title stays put as the buttons beside it change
          width (Purchase appears and disappears with the paywall, the save
          warning comes and goes). A flex-centred middle column would slide the
          title sideways every time one of those changed, which reads as the
          page twitching. `pointer-events` is restored on the content so the
          full-width box doesn't swallow clicks meant for the bar. */}
      {(center || (actions && centerActions)) && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-cp-3 max-w-[min(46%,26rem)]">
            {center ?? actions}
          </div>
        </div>
      )}
      <div className="relative z-[1] flex items-center gap-cp-2 sm:gap-cp-3 flex-nowrap justify-end shrink-0">
        {actions && !centerActions ? actions : null}
        <AccountControl saveStatus={saveStatus} onRetry={onRetrySave} onSave={onSave} />
      </div>
    </header>
  );
}
