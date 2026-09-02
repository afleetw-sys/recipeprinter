"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconButton } from "@/components/Controls";
import { ICON_SIZE, ExternalIcon, XIcon } from "@/components/icons";
import { localStore } from "@/lib/storage";

const PRODUCT_HUNT_URL =
  "https://www.producthunt.com/products/recipeprinter?utm_source=other&utm_medium=social";

const DISMISSED_KEY = "recipeprinter:product-hunt-banner:v1";

/**
 * When the banner stops showing itself, whoever dismissed it or not.
 *
 * A Product Hunt launch is one calendar day on Pacific time, so the banner's
 * life is that same day rather than 24 hours from whenever a visitor first
 * loads it: 2026-09-02 in PT ends at 2026-09-03T07:00Z (PDT is UTC-7). Written
 * as a UTC instant on purpose — a local `new Date(2026, 8, 3)` would keep the
 * banner up for most of the next day in Europe and retire it early in Hawaii,
 * and this is a moment in time, not a date on the reader's calendar.
 *
 * After that instant this component renders nothing on every route, so the
 * banner retires itself with no deploy needed. The code can then be deleted at
 * leisure (this file, and its one line in app/layout.tsx).
 */
const ENDS_AT = Date.UTC(2026, 8, 3, 7, 0, 0);

/** Routes that are the print workspace or the PDF renderer, not the site. */
function isAppSurface(pathname: string) {
  return pathname === "/print" || pathname.startsWith("/print/") || pathname.startsWith("/export");
}

/**
 * Launch-day bar above the site header.
 *
 * Deliberately not shown on /print or /export: the print layout is a
 * `h-dvh overflow-hidden` frame, so anything stacked above it pushes the
 * bottom of the workspace off the viewport, and /export is the page the PDF
 * renderer photographs. Everywhere else it's an ordinary block at the top of
 * the document flow, so it pushes the page down rather than covering anything.
 */
export function ProductHuntBanner() {
  const pathname = usePathname();
  // Starts hidden and is turned on in an effect, never during render: the
  // dismissal lives in localStorage, which the server can't see, so rendering
  // the bar in the HTML would flash it at everyone who already closed it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Date.now() >= ENDS_AT) return;
    if (localStore.get(DISMISSED_KEY) !== null) return;
    setVisible(true);
  }, []);

  if (!visible || isAppSurface(pathname)) return null;

  function dismiss() {
    setVisible(false);
    localStore.set(DISMISSED_KEY, "1");
  }

  return (
    <div className="no-print border-b border-line bg-[var(--cp-accent-warm-soft)] text-ink">
      <div className="max-w-content mx-auto flex items-center gap-cp-3 px-cp-4 sm:px-cp-6 py-cp-2">
        <p className="min-w-0 flex-1 text-cp-small leading-snug">
          <span className="font-bold">RecipePrinter is live on Product Hunt today.</span>{" "}
          <a
            href={PRODUCT_HUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            /* Stays --cp-ink on hover rather than going clay: clay is a fill, a
               border and an icon here, never a word. */
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 transition-opacity hover:opacity-70"
          >
            See the launch or leave a review
            <ExternalIcon size={ICON_SIZE.sm} />
          </a>
        </p>
        <IconButton className="-mr-1 shrink-0" aria-label="Dismiss launch announcement" onClick={dismiss}>
          <XIcon size={ICON_SIZE.md} />
        </IconButton>
      </div>
    </div>
  );
}
