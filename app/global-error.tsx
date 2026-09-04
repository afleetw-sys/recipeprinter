"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/analytics";

/**
 * The last resort: a throw in the root layout itself, which app/error.tsx sits
 * inside and therefore cannot catch. Next replaces the whole document when this
 * renders, so it has to supply its own <html> and <body> — and it cannot use
 * SiteHeader, the fonts, or globals.css, none of which are mounted at this
 * point. Hence the inline styles; this is the one file in the app where they
 * are correct rather than a shortcut.
 *
 * Reaching this is close to a total failure, so the only real job is to report
 * it and offer a reload.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.warn("RecipePrinter: root layout crashed", error);
    captureException(error, { surface: "root", digest: error.digest ?? "" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#1c1917",
          background: "#faf9f7",
        }}
      >
        <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
          RecipePrinter ran into a problem
        </p>
        <p style={{ color: "#57534e", margin: 0, maxWidth: "24rem" }}>
          Reloading usually clears it. Anything you have saved is unaffected.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            font: "inherit",
            fontWeight: 600,
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #1c1917",
            background: "#1c1917",
            color: "#faf9f7",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
