import { notFound } from "next/navigation";
import { LayoutHarness } from "./LayoutHarness";

// Dev-only layout measurement harness (Phase 0 regression net for the card
// pagination rewrite). Never routable in production — it renders the whole
// fixture corpus across the full config matrix and is purely an internal tool.
//
// The one exception is the browser tests' own production build, which sets
// LAYOUT_HARNESS=1 so e2e/layout-harness.spec.ts can sweep what actually ships.
// Read at build time (the page is static); Vercel never sets it.
export const dynamic = "force-static";

export default function HarnessPage() {
  if (process.env.NODE_ENV === "production" && process.env.LAYOUT_HARNESS !== "1") notFound();
  return <LayoutHarness />;
}
