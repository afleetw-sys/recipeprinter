import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./print.css";

// Older Safari (before 26) tints the status bar from theme-color; match the
// phone top bar's white so the bar runs up to the top of the screen.
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

// The print preview is a per-session, query-string-driven view of recipes the
// user just imported, there's no stable, standalone content to index here.
export const metadata: Metadata = {
  title: "Print preview",
  robots: { index: false, follow: false },
};

function PrintLoading() {
  return (
    <div className="flex-1 grid place-items-center px-cp-6 text-center text-ink-soft">
      <p className="text-cp-body-lg font-semibold">Preparing print preview…</p>
    </div>
  );
}

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden flex flex-col print:h-auto print:overflow-visible">
      <Suspense fallback={<PrintLoading />}>{children}</Suspense>
    </div>
  );
}
