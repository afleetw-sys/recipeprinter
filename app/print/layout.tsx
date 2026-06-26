import { Suspense } from "react";
import type { Metadata } from "next";

// The print preview is a per-session, query-string-driven view of recipes the
// user just imported — there's no stable, standalone content to index here.
export const metadata: Metadata = {
  title: "Print preview",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
