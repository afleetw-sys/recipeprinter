import { notFound } from "next/navigation";
import { LayoutHarness } from "./LayoutHarness";

// Dev-only layout measurement harness (Phase 0 regression net for the card
// pagination rewrite). Never routable in production — it renders the whole
// fixture corpus across the full config matrix and is purely an internal tool.
export const dynamic = "force-static";

export default function HarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LayoutHarness />;
}
