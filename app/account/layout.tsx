import type { Metadata } from "next";

// The page is a client component, so it can't export metadata itself. Without
// this layout it inherits the root layout's `index: true` and gets indexed as
// an empty signed-out shell. `follow` stays on: its links are ordinary site
// links.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
