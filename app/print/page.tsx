"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import RecipeView from "@/components/RecipeView";
import type { Recipe } from "@/types/recipe";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; recipe: Recipe }
  | { status: "error"; message: string };

export default function PrintPage() {
  const params = useSearchParams();
  const router = useRouter();
  const recipeUrl = params.get("url") ?? "";

  const [state, setState] = useState<State>({ status: "idle" });

  const parse = useCallback(async () => {
    if (!recipeUrl) {
      router.replace("/");
      return;
    }

    setState({ status: "loading" });

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: recipeUrl }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setState({ status: "error", message: data.error ?? "Something went wrong." });
        return;
      }

      setState({ status: "success", recipe: data.recipe });
    } catch {
      setState({ status: "error", message: "Network error — please try again." });
    }
  }, [recipeUrl, router]);

  useEffect(() => {
    parse();
  }, [parse]);

  return (
    <div className="min-h-screen flex flex-col bg-parchment-50">
      {/* Toolbar — hidden on print */}
      <header className="no-print sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-parchment-200">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="font-serif font-bold text-base text-parchment-950 tracking-tight hover:text-forest-700 transition-colors"
          >
            Recipe<span className="text-forest-600">Printer</span>
          </Link>

          <div className="flex items-center gap-3">
            {state.status === "success" && (
              <>
                {/* "Open in CookPilot" CTA */}
                <a
                  href={`https://app.cookpilotapp.com?import=${encodeURIComponent(recipeUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-800 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-forest-50"
                >
                  Open in CookPilot
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>

                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-forest-600 hover:bg-forest-700 active:bg-forest-800 text-white text-sm font-medium rounded-lg transition-colors shadow-card"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 5V1h8v4M3 10H1V6h12v4h-2M3 8h8v5H3V8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  Print
                </button>
              </>
            )}

            <Link
              href="/"
              className="text-sm text-parchment-500 hover:text-parchment-800 transition-colors px-2 py-2"
            >
              ← New recipe
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-12 px-6">
        <div className="max-w-recipe mx-auto">
          {state.status === "loading" && (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-8 h-8 border-2 border-parchment-300 border-t-forest-600 rounded-full animate-spin" />
              <p className="text-parchment-500 text-sm">Extracting recipe…</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-terra-50 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M10 7v4M10 13h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c8502a" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-parchment-950 mb-1">Couldn't extract the recipe</p>
                <p className="text-parchment-500 text-sm max-w-xs">{state.message}</p>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={parse}
                  className="text-sm font-medium text-forest-600 hover:text-forest-800 transition-colors"
                >
                  Try again
                </button>
                <Link
                  href="/"
                  className="px-4 py-2 bg-parchment-950 hover:bg-parchment-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  ← Back
                </Link>
              </div>
            </div>
          )}

          {state.status === "success" && (
            <>
              <RecipeView recipe={state.recipe} />

              {/* Post-print CTA — visible on screen only */}
              <div className="no-print mt-14 p-6 bg-white rounded-xl border border-parchment-200 shadow-card">
                <p className="font-semibold text-parchment-950 mb-1 text-sm">
                  Want to customize this recipe?
                </p>
                <p className="text-parchment-500 text-sm mb-4">
                  Adjust servings, swap ingredients, or save it to your collection in CookPilot.
                </p>
                <a
                  href={`https://app.cookpilotapp.com?import=${encodeURIComponent(recipeUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-600 hover:text-forest-800 transition-colors"
                >
                  Open in CookPilot →
                </a>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
