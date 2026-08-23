"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The logo, as a link home.
 *
 * Split out of `SiteHeader` for one reason: the header is a SERVER component on
 * every marketing and landing page, and a server component cannot carry an
 * event handler. The workspace needs to intervene before this navigation — to
 * file the open project, show it travelling into the profile, and start a fresh
 * one — so the handler has to live in a client module. Only the link moved, so
 * the rest of the header still renders on the server for the sixteen landing
 * pages that carry the search traffic.
 *
 * With no `onNavigateHome` this is exactly a `<Link>`, which is what every page
 * other than the workspace gets.
 */
export function HomeLink({
  href,
  children,
  onNavigateHome,
}: {
  href: string;
  children: ReactNode;
  onNavigateHome?: () => void;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-cp-3 group shrink-0"
      aria-label="RecipePrinter home"
      onClick={(event) => {
        if (!onNavigateHome) return;
        // Modified clicks open a new tab or window — this page isn't going
        // anywhere, so nothing is being put away and the default belongs.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        onNavigateHome();
      }}
    >
      {children}
    </Link>
  );
}
