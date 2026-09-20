import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The real Firebase Auth SDK against the Auth emulator, no mocks. Run with
// `npm run test:auth`, which starts the emulator around it. Kept out of the normal
// `vitest run` (which only looks in lib/ and scripts/) because it needs the
// emulator, exactly as the rules tests do.
export default defineConfig({
  test: {
    environment: "node",
    include: ["auth-tests/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
