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

function LogoMark({ size = 18 }: { size?: number }) {
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
    <div className="min-h-screen flex flex-col bg-[#EDEAE5]">

      {/* Toolbar — matches CookPilot's minimal top bar with action buttons right */}
      <header className="no-print sticky top-0 z-10 h-14 flex items-center px-6 bg-[#EDEAE5] border-b border-cream-300">
        <Link
          href="/"
          className="flex items-center gap-2 group"
        >
          {/* Back arrow — matches CookPilot's ← back button */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden
            className="text-cream-500 group-hover:text-charcoal-700 transition-colors">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <LogoMark size={18} />
          <span className="font-semibold text-charcoal-700 text-[15px] tracking-tight group-hover:text-charcoal-800 transition-colors">
            RecipePrinter
          </span>
        </Link>

        {state.status === "success" && (
          <div className="ml-auto flex items-center gap-2">
            {/* "Open in CookPilot" — secondary button style */}
            <a
              href={`https://app.cookpilotapp.com?import=${encodeURIComponent(recipeUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary hidden sm:inline-flex"
            >
              Open in CookPilot
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                <path d="M2 9L9 2M9 2H5M9 2V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            {/* Print — primary button matching "+ New recipe" style */}
            <button
              onClick={() => window.print()}
              className="btn-primary"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <path d="M2.5 4.5V1h8v3.5M2.5 9.5H1V5.5h11v4H9.5M2.5 7.5h8v4h-8v-4z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
              </svg>
              Print
            </button>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 py-10 px-6">
        <div className="max-w-recipe mx-auto">

          {state.status === "loading" && (
            <div className="flex flex-col items-center justify-center py-40 gap-3">
              <div className="w-6 h-6 border-2 border-cream-300 border-t-teal-400 rounded-full animate-spin" />
              <p className="text-cream-500 text-sm">Extracting recipe…</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center justify-center py-40 gap-4 text-center">
              <p className="font-semibold text-charcoal-700">Couldn't extract the recipe</p>
              <p className="text-cream-600 text-sm max-w-xs">{state.message}</p>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={parse} className="btn-secondary text-xs">
                  Try again
                </button>
                <Link href="/" className="btn-primary text-xs">
                  ← New recipe
                </Link>
              </div>
            </div>
          )}

          {state.status === "success" && (
            <>
              <RecipeView recipe={state.recipe} />

              {/* Post-print CTA — card matching CookPilot style */}
              <div className="no-print mt-10 card p-5">
                <p className="font-semibold text-charcoal-700 text-sm mb-1">
                  Want to customize this recipe?
                </p>
                <p className="text-cream-600 text-sm mb-4">
                  Adjust servings, swap ingredients, or save it to your collection.
                </p>
                <a
                  href={`https://app.cookpilotapp.com?import=${encodeURIComponent(recipeUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs"
                >
                  Open in CookPilot
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                    <path d="M2 9L9 2M9 2H5M9 2V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
