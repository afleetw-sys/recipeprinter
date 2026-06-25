import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Inter — matches CookPilot's UI font throughout the app
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Playfair Display — used only for printed recipe titles;
// gives RecipePrinter its publishing-tool identity without breaking CookPilot's sans-serif UI
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RecipePrinter — Beautiful Printable Recipes",
  description:
    "Paste any recipe URL and instantly get a clean, beautifully formatted version ready to print. No clutter, no ads — just the recipe.",
  openGraph: {
    title: "RecipePrinter",
    description: "Turn any online recipe into a beautiful printable version.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
