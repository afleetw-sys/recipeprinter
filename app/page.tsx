"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

// CookPilot logo mark — teal bird/leaf SVG matching the brand
function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3C7.5 3 4 7 4 11.5c0 2.5 1.2 4.8 3 6.3L12 21l5-3.2c1.8-1.5 3-3.8 3-6.3C20 7 16.5 3 12 3z"
        fill="#2ABFC8"
        opacity="0.9"
      />
      <path
        d="M9 11.5c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3-3-1.3-3-3z"
        fill="white"
        opacity="0.7"
      />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a recipe URL first.");
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setError("That doesn't look like a valid URL — include the https://");
      return;
    }

    router.push(`/print?url=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav — matches CookPilot's minimal top bar */}
      <header className="no-print h-14 flex items-center px-6 border-b border-cream-300 bg-[#EDEAE5]">
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="font-semibold text-charcoal-700 text-[15px] tracking-tight">
            RecipePrinter
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1 text-sm text-cream-600">
          <span>by</span>
          <a
            href="https://cookpilotapp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-500 hover:text-teal-600 font-medium ml-1 transition-colors"
          >
            CookPilot
          </a>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-landing text-center">

          {/* Eyebrow tag — styled like CookPilot's filter pills */}
          <div className="inline-flex items-center gap-2 tag-pill mb-8 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
            From the CookPilot team
          </div>

          <h1 className="text-5xl sm:text-[3.5rem] font-bold text-charcoal-700 leading-[1.1] tracking-tight mb-5">
            Beautiful recipes,
            <br />
            ready to print.
          </h1>

          <p className="text-cream-600 text-base leading-relaxed mb-10 max-w-sm mx-auto">
            Paste any recipe URL. We strip the clutter and give you a clean,
            print-ready version in seconds.
          </p>

          {/* URL input form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.seriouseats.com/your-recipe"
                className="flex-1 px-4 py-3 rounded text-sm shadow-card"
                autoFocus
              />
              <button type="submit" className="btn-primary px-5 py-3 text-sm whitespace-nowrap">
                Print Recipe
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 5V1h8v4M3 10H1V6h12v4h-2M3 8h8v5H3V8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {error && (
              <p className="text-red-500 text-sm text-left">{error}</p>
            )}
          </form>

          {/* How it works — matches CookPilot's clean card style */}
          <div className="mt-20 grid grid-cols-3 gap-4 text-left">
            {[
              { n: "1", title: "Paste a URL", body: "Copy any recipe link from the web." },
              { n: "2", title: "We format it",  body: "The recipe is extracted and laid out cleanly." },
              { n: "3", title: "Print it",       body: "Only the recipe prints — no ads, no clutter." },
            ].map(({ n, title, body }) => (
              <div key={n} className="card p-4 flex flex-col gap-2">
                {/* Step badge — matches CookPilot's step number circles */}
                <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-500 font-semibold text-sm flex items-center justify-center flex-shrink-0">
                  {n}
                </div>
                <p className="font-semibold text-charcoal-700 text-sm">{title}</p>
                <p className="text-cream-600 text-xs leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="no-print h-14 flex items-center px-6 border-t border-cream-300 text-xs text-cream-500">
        <div className="max-w-content mx-auto w-full flex items-center justify-between">
          <span>
            RecipePrinter is a{" "}
            <a
              href="https://cookpilotapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-500 hover:text-teal-600 transition-colors"
            >
              CookPilot
            </a>{" "}
            product
          </span>
          <span>© {new Date().getFullYear()} CookPilot</span>
        </div>
      </footer>
    </div>
  );
}
