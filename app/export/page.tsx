"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ScaledPage } from "@/components/print/ScaledPage";
import { usePrintSheets } from "@/lib/usePrintSheets";
import {
  getCookbookPreset,
  presetArtScale,
  presetSheetInches,
} from "@/lib/cookbookPresets";
import { isPrintCardSize, isRecipePrintTemplate } from "@/lib/printSettings";
import type { ExportPayload } from "@/types/export";
import type { QueueItem } from "@/types/recipe";

/** Backstop for the paint frame below; see the note there. */
const EXPORT_READY_FALLBACK_MS = 1500;

/**
 * The page the PDF renderer photographs.
 *
 * Every pixel of a printed cookbook already exists in the preview, so this
 * reuses the same layout engine (`usePrintSheets`) and the same page component
 * (`ScaledPage`) rather than a second renderer that could drift from what
 * people approved on screen. The difference is what's NOT here: no header,
 * rail, config panel, floating controls, or scroll deck.
 *
 * That absence is the point. The existing `@media print` rules spend most of
 * their length undoing the workspace — un-scaling the deck, hiding chrome,
 * suppressing the blank leading page the topbar caused. Against this tree they
 * have nothing to undo, so they quietly become no-ops, and step 4 of the PDF
 * work can delete them for real once the browser-print path retires.
 *
 * Rendered at `scale={1}`: true physical page size, no preview shrink.
 */
export default function ExportPage() {
  const [payload, setPayload] = useState<ExportPayload | null>(null);

  useEffect(() => {
    // Present already when the renderer injected it before navigation; the
    // setter covers driving this route by hand in a browser.
    if (window.__RP_EXPORT__) setPayload(window.__RP_EXPORT__);
    window.__rpExportSetPayload = (next) => setPayload(next);
    return () => {
      delete window.__rpExportSetPayload;
    };
  }, []);

  return payload ? <ExportDocument payload={payload} /> : null;
}

function ExportDocument({ payload }: { payload: ExportPayload }) {
  const { project } = payload;
  const settings = project.settings;
  const preset = getCookbookPreset(payload.preset);

  // The recipes, in book order. `PrintProject.sections` already holds them
  // nested exactly as the layout engine wants them.
  const items = useMemo<QueueItem[]>(
    () => project.sections.flatMap((section) => section.items),
    [project.sections],
  );

  const cardSize = isPrintCardSize(settings.cardSize) ? settings.cardSize : "letter";
  const template = isRecipePrintTemplate(settings.template) ? settings.template : "classic";
  const cookbookMode = Boolean(settings.cookbookMode);
  // Mirrors the derivations the workspace makes (see `photosOn` / `sourceUrlOn`
  // in app/print/page.tsx): a toggle only takes effect if the content can honour
  // it, and the layout engine must be handed the resolved answer, not the raw
  // preference, or it paginates for photos that aren't there.
  const anyRecipeHasImage = items.some((item) => Boolean(item.recipe?.image));
  const anyRecipeHasSourceUrl = items.some((item) => Boolean(item.recipe?.sourceUrl));
  const photoStyle = settings.photoStyle ?? "card";
  const headerPhotosOn = cookbookMode ? photoStyle === "card" : settings.showPhoto;

  const { sheets, printLayoutReady, measurers } = usePrintSheets({
    sections: project.sections,
    items,
    cover: project.cover,
    backCover: project.backCover,
    dedication: project.dedication,
    tableOfContents: cookbookMode ? settings.tableOfContents : false,
    bookTitle: project.cover?.title,
    cookbookMode,
    itemPlacements: project.itemPlacements,
    defaultFullPage: cookbookMode && photoStyle === "full",
    cardSize,
    doubleSided: settings.doubleSided,
    photosOn: headerPhotosOn && anyRecipeHasImage,
    sourceUrlOn: settings.showSourceUrl && anyRecipeHasSourceUrl,
    template,
  });

  /**
   * The renderer's go signal.
   *
   * `printLayoutReady` means the measurement pass has settled, but a settled
   * layout is not yet a painted one, and a font swapping in after capture
   * reflows text off its page. So: measured, then fonts resolved, then a frame.
   *
   * The frame is raced against a timer on purpose. `requestAnimationFrame` does
   * not fire in a page the browser isn't painting — I hit exactly that here,
   * with a fully laid-out book and a signal that never came. A renderer waiting
   * on this would hang rather than fail, which is the worse way to break, so
   * the timer guarantees the signal even if no frame is ever served.
   */
  useEffect(() => {
    if (!printLayoutReady || sheets.length === 0) return;
    let done = false;
    const signal = () => {
      if (done) return;
      done = true;
      window.__RP_EXPORT_READY__ = true;
      document.documentElement.setAttribute("data-export-ready", "true");
    };
    let frame = 0;
    const timer = window.setTimeout(signal, EXPORT_READY_FALLBACK_MS);
    void document.fonts.ready.then(() => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(signal);
      });
    });
    return () => {
      done = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [printLayoutReady, sheets.length]);

  // The same class + variable pair the deck applies for the instant it prints
  // (see `deckExportClass` in app/print/page.tsx) — here it is simply always on,
  // because this route exists only to be exported. `--rp-sheet-*` is why the
  // page box is pinned in absolute inches: WebKit resolves a print `100vh`
  // against the on-screen viewport, which collapses a custom trim to a sliver.
  const exportStyle = {
    "--rp-art-scale": presetArtScale(preset),
    "--rp-sheet-w": presetSheetInches(preset).w,
    "--rp-sheet-h": presetSheetInches(preset).h,
  } as CSSProperties;

  return (
    <div
      className={`recipe-page-deck rp-exporting ${preset.pageClass}${preset.coilBound ? " rp-coil" : ""} ${
        cookbookMode ? "recipe-page-deck--book" : ""
      }`}
      style={exportStyle}
      data-export-root="true"
    >
      {measurers}
      {sheets.map((sheet, index) => (
        <div className="recipe-page-slide" key={`sheet-${index}`}>
          <ScaledPage
            sheet={sheet}
            isLastSheet={index === sheets.length - 1}
            // -1, not 0: on screen `activeSlotIndex` hides every card but one.
            // An export wants every slot on the sheet, so match nothing.
            activeSlotIndex={-1}
            activeSide="front"
            scale={1}
            size={cardSize}
            template={template}
            doubleSided={settings.doubleSided}
            cookbookMode={cookbookMode}
            showSourceUrl={settings.showSourceUrl && anyRecipeHasSourceUrl}
            showCutLines={settings.showCutLines && cardSize === "card-6x4"}
            tocKicker={settings.tocKicker}
            tocTitle={settings.tocTitle}
          />
        </div>
      ))}
    </div>
  );
}
