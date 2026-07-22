import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node environment on purpose — no jsdom. Everything under test here is pure:
// the character-budget pagination engine and the invariant checks over its
// output. The half that genuinely needs a browser (RecipeFaceMeasurer's
// settle loop, real rendered overflow in px) stays in the interactive harness
// at app/print/harness, which can measure what no headless assertion can.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
