"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { capturePageleave, capturePageview, initAnalytics, track } from "@/lib/analytics";
import { screenshotShortcutFrom } from "@/lib/screenshotShortcut";

// useSearchParams opts the subtree into client-side rendering, so it has to
// sit behind its own Suspense boundary or every route using this layout is
// forced out of static generation.
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Declared first so init always precedes the first pageview capture.
  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    function handleScreenshotShortcut(event: KeyboardEvent) {
      const shortcut = screenshotShortcutFrom(event);
      if (shortcut) track("screenshot_shortcut_detected", { shortcut });
    }
    window.addEventListener("keydown", handleScreenshotShortcut, true);
    return () => window.removeEventListener("keydown", handleScreenshotShortcut, true);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
    capturePageview(url);
    // The cleanup runs on a route change, which is the moment this pageview
    // actually ended. It does NOT run on a real unload, so posthog-js's own
    // `$pageleave` still covers that case and neither is counted twice.
    return () => capturePageleave(url);
  }, [pathname, searchParams]);

  return null;
}

export function AnalyticsProvider() {
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
