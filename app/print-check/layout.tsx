import type { Metadata } from "next";

// Our own diagnostics for printing inside in-app browsers (the Google app,
// Instagram…). Opened by us, on a phone, never linked; kept out of search and,
// in lib/analytics, out of PostHog.
export const metadata: Metadata = {
  title: "Print check",
  robots: { index: false, follow: false },
};

export default function PrintCheckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
