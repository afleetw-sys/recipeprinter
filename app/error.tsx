"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { captureException } from "@/lib/analytics";

/**
 * Error boundary for every route that isn't /print.
 *
 * /print has its own (app/print/error.tsx), and that one stays: it can retry a
 * chunk error, it knows the queue survives in sessionStorage, and it can say so.
 * Its comment explains why it was scoped to that segment rather than the root —
 * "a root boundary would swallow marketing-page errors into a message about
 * recipes" — which is a reason to keep this copy neutral, not a reason to have
 * no boundary at all. Next's own fallback is a bare "Application error: a
 * client-side exception has occurred" with no route back.
 *
 * The bigger gap was telemetry. `captureException` had exactly one call site,
 * inside the /print boundary, so a crash on /projects, /export, a shared card,
 * or any landing page was invisible in production. A more specific segment
 * boundary still wins over this one, so adding those later costs nothing.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.warn("RecipePrinter: page crashed", error);
    captureException(error, { surface: "app", digest: error.digest ?? "" });
  }, [error]);

  return (
    <div className="h-full flex flex-col">
      <SiteHeader compact sticky />
      <div className="flex-1 flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
        <p className="font-bold text-cp-h2">This page ran into a problem</p>
        <p className="text-ink-soft max-w-sm">
          Loading it again usually clears it. Anything you have saved is unaffected.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-cp-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Go to your recipes
          </Link>
        </div>
      </div>
    </div>
  );
}
