import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";

// Manrope — CookPilot's UI typeface. Matching it is what makes RecipePrinter
// read as a sibling product rather than a separate app.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

// Playfair Display — reserved for printed recipe titles only, giving the
// printed page a cookbook identity without touching CookPilot's sans-serif UI.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RecipePrinter — Print any recipe without the clutter",
  description:
    "Paste a recipe URL, upload a photo, or paste recipe text. We turn it into a clean, letter-size recipe you can print in seconds. A CookPilot product.",
  openGraph: {
    title: "RecipePrinter",
    description:
      "Print any recipe without the clutter — clean, letter-size pages. By the CookPilot team.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
