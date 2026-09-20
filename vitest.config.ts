import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node environment by default. Almost everything under test here is pure: the
// character-budget pagination engine and the invariant checks over its output.
// The half that genuinely needs a browser (RecipeFaceMeasurer's settle loop,
// real rendered overflow in px) stays in the interactive harness at
// app/print/harness, which can measure what no headless assertion can.
//
// The exception is React state and effect behaviour (the hooks pulled out of
// app/print/page.tsx). Those tests opt in to jsdom per file with a
// `// @vitest-environment jsdom` comment on the first line and use
// @testing-library/react's renderHook, so the pure tests keep running in node.
export default defineConfig({
  test: {
    environment: "node",
    // `scripts/` covers the build-time guards (the design-system audit's
    // comment stripper). They live outside lib/ on purpose — they are tooling,
    // not app code, and nothing shippable should be able to import them — but
    // they are pure functions whose failure mode is a guard that silently stops
    // guarding, so they get the same treatment as the pagination engine.
    include: [
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
  },
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
