import type { Metadata } from "next";
import "../print/print.css";

// The PDF renderer's target. Deliberately imports the SAME `print.css` the
// preview uses: a book must not be laid out by one stylesheet on screen and a
// different one in the file people pay for. What this route drops is the
// workspace around the pages — header, rail, config panel, controls — not the
// page design itself.
export const metadata: Metadata = {
  title: "Export",
  robots: { index: false, follow: false },
};

export default function ExportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
