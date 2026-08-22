import { Suspense } from "react";
import type { Metadata } from "next";
import "../../print/print.css";

/**
 * Wraps only `/projects/<id>` — not `/projects`, which is the library and has
 * no use for 128 KB of print stylesheet.
 *
 * A project belongs to one person and its contents are theirs; there is no
 * stable public content here to index. (The public surface is `/print/<slug>`,
 * a deliberately shared single card, which sets its own indexable metadata.)
 */
export const metadata: Metadata = {
  title: "Your project",
  robots: { index: false, follow: false },
};

function StudioLoading() {
  return (
    <div className="flex-1 grid place-items-center px-cp-6 text-center text-ink-soft">
      <p className="text-cp-body-lg font-semibold">Opening your project…</p>
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden flex flex-col print:h-auto print:overflow-visible">
      <Suspense fallback={<StudioLoading />}>{children}</Suspense>
    </div>
  );
}
