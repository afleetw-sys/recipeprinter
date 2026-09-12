import { PRINTED_CARDS, type PrintedCard } from "@/lib/seoAssets";
// Drawn here, declared in lib/seoAssets — re-exported so existing importers of
// this module are unaffected.
export { PRINTED_CARDS };
export type { PrintedCard };

// ─────────────────────────────────────────────────────────────────────────────
// The catalogue of SEO landing-page photography: real printed recipe cards.
//
// These are photographs of actual cards printed from RecipePrinter, sitting on a
// real table in real light. Nothing here is fabricated or greeked: the whole
// point is that a real printed card is the thing that sells the product, and no
// mockup can fake it.
//
// Data only — the components that FRAME these photos live in LandingVisuals.
// Files live in /public/images. Swap or add photos by editing PRINTED_CARDS.
// ─────────────────────────────────────────────────────────────────────────────


// The real card photos. Dimensions are the portrait phone-camera aspect (3:4);
// next/image only uses the ratio, so approximate is fine.


