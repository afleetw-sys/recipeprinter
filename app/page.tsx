"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a recipe URL.");
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setError("That doesn't look like a valid URL. Make sure to include https://");
      return;
    }

    router.push(`/print?url=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="no-print border-b border-parchment-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-serif font-bold text-lg text-parchment-950 tracking-tight">
            Recipe<span className="text-forest-600">Printer</span>
          </span>
          <nav className="flex items-center gap-6 text-sm text-parchment-600">
            <span className="text-parchment-400 text-xs">by</span>
            <a
              href="https://cookpilotapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-forest-600 hover:text-forest-800 font-medium transition-colors"
            >
              CookPilot
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-landing text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-forest-50 border border-forest-200 rounded-full px-3 py-1 text-xs font-medium text-forest-700 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-forest-500 inline-block" />
            From the CookPilot team
          </div>

          <h1 className="font-serif text-5xl sm:text-6xl font-bold text-parchment-950 leading-tight tracking-tight mb-5">
            Beautiful recipes,
            <br />
            <span className="text-forest-600">ready to print.</span>
          </h1>

          <p className="text-parchment-600 text-lg leading-relaxed mb-12 max-w-md mx-auto">
            Paste any recipe URL. RecipePrinter strips the clutter and formats
            it for the page — gorgeous typography, clean layout, no ads.
          </p>

          {/* URL form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.seriouseats.com/your-recipe"
                className="flex-1 px-4 py-3.5 rounded-lg border border-parchment-300 bg-white text-parchment-950 placeholder:text-parchment-400 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-shadow shadow-card"
                autoFocus
              />
              <button
                type="submit"
                className="px-6 py-3.5 bg-forest-600 hover:bg-forest-700 active:bg-forest-800 text-white font-medium text-sm rounded-lg transition-colors shadow-card whitespace-nowrap"
              >
                Print Recipe →
              </button>
            </div>

            {error && (
              <p className="text-terra-600 text-sm text-left">{error}</p>
            )}
          </form>

          {/* How it works */}
          <div className="mt-20 grid grid-cols-3 gap-6 text-left">
            {[
              {
                n: "1",
                title: "Paste a URL",
                body: "Copy any recipe link from the web and paste it above.",
              },
              {
                n: "2",
                title: "We format it",
                body: "Our parser extracts the recipe and presents it in a clean, readable layout.",
              },
              {
                n: "3",
                title: "Print it",
                body: "Hit Print. Only the recipe comes through — no ads, no blog posts, no clutter.",
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex flex-col gap-2">
                <div className="w-8 h-8 rounded-full bg-forest-100 text-forest-700 font-serif font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {n}
                </div>
                <h3 className="font-semibold text-parchment-950 text-sm">{title}</h3>
                <p className="text-parchment-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="no-print border-t border-parchment-200 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-parchment-500">
          <span>
            Recipe<span className="text-forest-600 font-medium">Printer</span> — a{" "}
            <a
              href="https://cookpilotapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-forest-600 hover:text-forest-800 transition-colors"
            >
              CookPilot
            </a>{" "}
            product
          </span>
          <span className="text-parchment-400 text-xs">
            © {new Date().getFullYear()} CookPilot
          </span>
        </div>
      </footer>
    </div>
  );
}
