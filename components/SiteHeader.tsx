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
  chrome = false,
  saveStatus,
  onRetrySave,
  onSave,
  lead,
  center,
  wordmark = true,
  onNavigateHome,
}: {
  backHref?: string;
  actions?: ReactNode;
  /** Center `actions` in the bar (absolute) rather than right-aligning them.
      Superseded by `center`, which lets a page have both. */
  centerActions?: boolean;
  /** Centred on the page, independent of `actions`. The workspace puts the
      project's title and what kind of document it is here — the two facts that
      say WHICH thing you are looking at. On the workspace they sit in the
      brand's place, because there the document IS what the page is about; the
      logo stays beside them as the way home. */
  lead?: ReactNode;
  /** Centred on the page, independent of `actions`. The workspace puts the
      document's name and kind here — the two facts that say WHICH thing you
      are looking at, which belong in the middle rather than queued up with the
      controls that act on it. */
  center?: ReactNode;
  /** Drop the wordmark, keeping just the mark as the home link. For surfaces
      that put something more useful than the product's own name in that
      corner. */
  wordmark?: boolean;
  compact?: boolean;
  sticky?: boolean;
  /** Paints the sticky bar with the workspace's off-white `bg-chrome` — the
      /print editor only (and its own loading/error states, which are still
      that page). Every other sticky header, marketing pages included, stays
      transparent; a background here used to be tied to `compact` alone,
      which every app-chrome-styled header opted into whether or not it was
      actually /print, and marketing headers carried their own plain-white
      fill regardless of this prop at all. */
  chrome?: boolean;
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
      {wordmark && (
        /* The mark alone below `sm`. The name next to it is the same word the
           logo already is, and on a phone it was spending a third of the bar
           to repeat it — a bar that also has to hold a CTA on the landing
           pages. Nothing is lost to a screen reader: the mark is `aria-hidden`
           and the link around it is named "RecipePrinter home" (see
           HomeLink). */
        <Wordmark
          className={`hidden sm:inline-flex ${
            compact
              ? "text-[length:var(--cp-fs-wordmark-compact)]"
              : "text-[length:var(--cp-fs-wordmark)]"
          } text-ink`}
        />
      )}
    </>
  );

  return (
    <header
      /* 50px in the workspace, 62px everywhere else. The bar holds 30px
         controls, so 62px was 16px of air above and below them — a document
         header's proportions on a page that is a tool. `compact` already means
         "app chrome" (it picks the smaller wordmark), so the marketing pages
         keep the taller bar they want. */
      className={`no-print relative flex items-center justify-between gap-cp-3 sm:gap-cp-4 px-cp-4 sm:px-cp-6 flex-nowrap ${
        compact ? "min-h-[56px]" : "min-h-[62px]"
      } ${
        sticky
          ? /* `--z-sticky` (globals.css), not a bare Tailwind number — this
               header is what establishes the account dropdown's own stacking
               context (it's a positioned descendant of THIS element, not the
               page root), so whatever tier the header sits at is the ceiling
               the dropdown can ever reach, no matter its own z-index. On
               /print, a plain `z-10` here left the dropdown trapped below the
               floating mobile toolbar (z-index 75) and the mobile sheets
               (77-81) — raising the header to the tier the app's own scale
               already reserves for "the workspace header, the rail, the
               mobile bars" clears all of them at once. */
            `sticky top-0 z-[var(--z-sticky)] ${
              compact ? "py-cp-2" : "py-cp-3"
            } ${
              /* Only the actual `chrome` callers (the /print workspace, and
                 the loading/error states that are still that same page) get
                 a fill — there the bar is one side of the frame around the
                 deck and takes the frame's near-white, matching the rail and
                 the settings panel, and the hairline is what separates it
                 from the deck below. Every other sticky header — marketing
                 pages included — stays fully transparent, no border either:
                 with nothing painted behind it, a dividing line would just be
                 a stray rule floating over whatever scrolls underneath. */
              chrome ? "bg-chrome border-b border-line" : ""
            }`
          : ""
      }`}
    >
      {/* The left group: the way home, and — where a page provides one — what
          you are looking at, sitting where the product's name would otherwise
          be. `min-w-0` so the name is what truncates when the bar gets tight,
          rather than shoving the buttons off the end. */}
      <div className="flex items-center gap-cp-3 min-w-0">
        <HomeLink href={backHref ?? "/"} onNavigateHome={onNavigateHome}>
          {logo}
        </HomeLink>
        {lead}
      </div>
      {/* Centred on the PAGE, not between its neighbours — absolutely
          positioned so the title holds still as the buttons beside it change
          width (Buy & Print appears and disappears with the paywall, the save
          state comes and goes). A flex-centred middle column would slide the
          title sideways every time one of those changed, which reads as the
          page twitching. `pointer-events` is restored on the content so the
          full-width box doesn't swallow clicks meant for the bar. */}
      {(center || (actions && centerActions)) && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center px-cp-6">
          <div className="pointer-events-auto flex items-center min-w-0 max-w-[min(44%,26rem)]">
            {center ?? actions}
          </div>
        </div>
      )}
      <div className="relative z-[1] flex items-center gap-cp-2 sm:gap-cp-3 flex-nowrap justify-end shrink-0">
        {actions && !centerActions ? actions : null}
        {/* `compact` is this bar's answer to "am I app chrome or a page?",
            and the controls inside it need it for the same reason the bar and
            the wordmark do — otherwise the account control is workspace-sized
            on a marketing page and reads 4px short beside the CTA. */}
        <AccountControl
          compact={compact}
          saveStatus={saveStatus}
          onRetry={onRetrySave}
          onSave={onSave}
        />
      </div>
    </header>
  );
}
