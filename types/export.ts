import type { CookbookPresetId, PrintProject } from "@/types/recipe";

/**
 * What the PDF renderer needs to draw a book, and nothing else.
 *
 * It is a `PrintProject` because that shape ALREADY carries exactly this —
 * sections with their recipes, cover/back cover/dedication, per-recipe page
 * placements, and every print setting — and `assemblePrintProject` already
 * builds one from the live workspace. Inventing a second export-only shape
 * would mean a second thing to keep in sync with the layout engine.
 *
 * Sent as a POST body rather than resolved server-side from a project id, so
 * exporting works signed out. Someone who has paid for a book should not meet
 * a sign-in wall on the way to downloading it.
 */
export interface ExportPayload {
  project: PrintProject;
  /** Physical format to render at — trim size and bleed. */
  preset: CookbookPresetId;
}

declare global {
  interface Window {
    /** Injected by the renderer before navigation (`evaluateOnNewDocument`), so
        it is present on the very first render and there is no round trip. */
    __RP_EXPORT__?: ExportPayload;
    /** Escape hatch for driving the route by hand in a browser, and for tests. */
    __rpExportSetPayload?: (payload: ExportPayload) => void;
    /** Flipped once fonts are loaded and the measured layout has settled and
        painted. The renderer waits on this before asking for the PDF —
        screenshotting a book mid-measurement is how you get half-empty pages. */
    __RP_EXPORT_READY__?: boolean;
  }
}
