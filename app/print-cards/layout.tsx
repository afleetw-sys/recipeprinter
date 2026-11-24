import type { Metadata } from "next";

// A hand-off on the way to /print, never a page anyone lands on. Kept out of
// the index like /print itself.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PrintCardsLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh rp-print-frame">{children}</div>;
}
