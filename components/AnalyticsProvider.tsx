"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { capturePageview, initAnalytics } from "@/lib/analytics";

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
    if (!pathname) return;
    const query = searchParams?.toString();
    capturePageview(
      `${window.location.origin}${pathname}${query ? `?${query}` : ""}`,
    );
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
