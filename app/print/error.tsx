"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import {
  claimChunkErrorReload,
  isChunkLoadError,
  recordPrintError,
} from "@/lib/printErrorRecovery";

/**
 * Error boundary for the print preview.
 *
 * Without one, any throw inside the print page — a 2,000-line client component
 * driving pagination, measurement, inline editing and purchases — escapes to
 * Next's root error screen, which gives the user a blank page and no route
 * back. That is a bad outcome for an unusually costly reason: the work they'd
 * be staring at is the recipes they just spent minutes importing.
 *
 * The important part is what this DOESN'T do. It doesn't clear anything. The
 * queue and the project metadata live in sessionStorage (see lib/queue.ts and
 * lib/project.ts), so they survive the crash untouched, and `reset()` re-mounts
 * the page against that same still-intact session. A render-phase crash is
 * therefore usually fully recoverable by remounting — the state that matters
 * was never in React to begin with. Transient crashes are retried
 * automatically; the manual recovery UI only appears after repeated failures.
 *
 * Deliberately scoped to the /print segment rather than the app root: this is
 * the only route with anything to lose, and a root boundary would swallow
 * marketing-page errors into a message about recipes.
 */
export default function PrintError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recovery] = useState(recordPrintError);

  useEffect(() => {
    // Same channel the rest of the app uses for non-fatal failures (see the
    // save/profile handlers in the print page). Not wired to analytics: the
    // event map in lib/analytics.ts is a closed, typed set of *product*
    // events, and adding a crash reporter is a separate decision from this.
    console.warn("RecipePrinter: print preview crashed", error);
  }, [error]);

  useEffect(() => {
    if (isChunkLoadError(error) && claimChunkErrorReload()) {
      // A remount keeps using the stale Next.js runtime and requests the same
      // missing chunk again. A real navigation fetches the current build
      // manifest; queue/project data survives because it lives in
      // sessionStorage.
      window.location.reload();
      return;
    }
    if (!recovery.shouldRetry) return;
    const retryTimer = window.setTimeout(reset, recovery.delayMs);
    return () => window.clearTimeout(retryTimer);
  }, [error, recovery, reset]);

  if (recovery.shouldRetry) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader compact sticky />
        <div
          className="flex-1 flex flex-col items-center justify-center gap-cp-3 text-center px-cp-6"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-line border-t-brand" />
          <p className="font-bold text-cp-h2">Recovering your print preview…</p>
          <p className="text-ink-soft">Your recipes are safe. Retrying automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <SiteHeader compact sticky />
      <div className="flex-1 flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
        <p className="font-bold text-cp-h2">The print preview couldn’t recover</p>
        <p className="text-ink-soft max-w-sm">
          We retried automatically, but the same problem continued. Your recipes are still
          saved in this tab.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-cp-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Back to your recipes
          </Link>
        </div>
      </div>
    </div>
  );
}
