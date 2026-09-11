"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import {
  claimChunkErrorReload,
  isChunkLoadError,
  recordPrintError,
} from "@/lib/printErrorRecovery";
import { fileProjectLocally } from "@/lib/localProjects";
import { readMeta } from "@/lib/project";
import { readQueue } from "@/lib/queue";
import { captureException } from "@/lib/analytics";

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
 *
 * It matters more than it used to. Importing used to happen on the home page,
 * so a print page that would not render still left a working app one click
 * away. Now every import lands here, and a crash here is the whole product —
 * which is why the last screen does not just apologise, it shelves the work and
 * points at where it went.
 */
export default function PrintError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recovery] = useState(recordPrintError);
  /**
   * Say what survived, by name.
   *
   * "Your recipes are safe" was true and asked to be taken on faith, on the one
   * screen with no credibility left. The recipes are right there in storage, so
   * this reads them and prints their titles: a cook who sees the five things
   * they imported listed on the failure screen knows the import worked and the
   * failure is only the drawing of it. That is the whole job of this screen once
   * retrying has stopped helping.
   *
   * Filed to the on-device shelf on the way past (lib/localProjects), which is
   * the same filing the home page does and is idempotent by content, so crashing
   * twice shelves one project rather than two. That is durability, not a route:
   * `listableLocalProjects` deliberately keeps unsaved card jobs out of the
   * library, so there is nowhere to send anyone to look at them. Reopening the
   * print page is what brings them back, and that is what the buttons do.
   *
   * Read from storage rather than through the hooks: the component that owned
   * them is the one that just came apart.
   */
  const [rescued] = useState<string[]>(() => {
    try {
      const items = readQueue();
      // Best effort. A shelf that cannot be written to (private mode, quota)
      // costs durability, never this screen — the session copy is still there
      // and is what a reload reads. Never let recovery be a second crash.
      try {
        fileProjectLocally(items, readMeta());
      } catch {
        // Nothing to do about it here, and nothing depending on it.
      }
      return items
        .filter((item) => item.status === "ready" && item.recipe)
        .map((item) => item.title)
        .filter(Boolean);
    } catch {
      return [];
    }
  });
  // Enough to recognise the job, not the whole book: a sixty-recipe cookbook
  // listed in full would bury the buttons under it.
  const named = rescued.slice(0, 4);
  const unnamed = rescued.length - named.length;

  useEffect(() => {
    // Same channel the rest of the app uses for non-fatal failures (see the
    // save/profile handlers in the print page).
    console.warn("RecipePrinter: print preview crashed", error);
    // Report to PostHog error tracking — kept OUT of the typed product-event
    // map (it's a reliability signal, not a product event). This is the most
    // fragile, highest-value screen in the app; without this, render crashes
    // here are invisible in production.
    captureException(error, { surface: "print", digest: error.digest ?? "" });
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
          {rescued.length > 0
            ? "We retried automatically and the same problem continued. Nothing is lost. These recipes are saved on this device:"
            : "We retried automatically and the same problem continued. Anything you had imported is still saved on this device."}
        </p>

        {/* The evidence, not a reassurance. See `rescued`. */}
        {rescued.length > 0 && (
          <ul className="max-w-sm text-cp-body font-bold">
            {named.map((title) => (
              <li key={title}>{title}</li>
            ))}
            {unnamed > 0 && (
              <li className="font-medium text-ink-soft">
                and {unnamed} more {unnamed === 1 ? "recipe" : "recipes"}
              </li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-center gap-cp-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          {/* A reload, not a link home. Home releases the working copy on
              arrival (see PrinterWorkspace), so "Back to your recipes" was the
              one button here that walked away from them. This one re-enters the
              page against the same intact session, on a fresh runtime — which
              is the difference between it and Try again, and is what clears a
              stale build rather than a bad render. */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </div>
    </div>
  );
}
