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
import { coverWrapGeometry, spineFitsTitle } from "@/lib/coverWrap";
import { CoverFace, SpineFace } from "@/components/RecipeCardPrint";
import type { ExportPayload } from "@/types/export";
import type { QueueItem } from "@/types/recipe";

/** Backstop for the paint frame only — never for fonts or images. */
const EXPORT_READY_FALLBACK_MS = 1000;

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
  // The wrap is a single sheet with no paginated content, so it skips the whole
  // measurement pipeline below — running the layout engine for it would spin up
  // measurers for a book this render never draws.
  if (payload.mode === "cover-wrap") return <CoverWrapDocument payload={payload} />;
  return <InteriorDocument payload={payload} />;
}

/**
 * The hardcover case wrap: back cover, spine, front cover on one flat sheet.
 *
 * Ready immediately after fonts and images resolve — there is nothing to
 * measure — but it raises the same `data-export-ready` flag on the same terms,
 * so the renderer's contract is identical for both modes.
 */
/**
 * Raises the renderer's go signal, and is the ONLY thing it waits on.
 *
 * Shared by both export modes so the renderer's contract is identical whether
 * it is capturing a book or a cover wrap.
 *
 * This has to be authoritative, because the renderer no longer waits for the
 * network to fall quiet before capturing — that heuristic cost ~900ms per
 * export and was standing in for three things this can state exactly:
 * the measured layout has settled, the fonts have resolved, and every image
 * has decoded. A book captured a beat early loses photos or reflows text off
 * its page, and nothing downstream would notice.
 *
 * Only the final paint frame is raced against a timer. `requestAnimationFrame`
 * does not fire in a page the browser isn't painting — I hit exactly that,
 * with a fully laid-out book and a signal that never came — and a renderer
 * waiting on it would hang rather than fail. The content guarantees above are
 * never skipped; only the paint is.
 */
function useExportReady(contentReady: boolean): void {
  useEffect(() => {
    if (!contentReady) return;
    let cancelled = false;
    let done = false;
    let frame = 0;
    let timer = 0;
    const signal = () => {
      if (done || cancelled) return;
      done = true;
      window.__RP_EXPORT_READY__ = true;
      document.documentElement.setAttribute("data-export-ready", "true");
    };

    const imagesDecoded = () =>
      Promise.all(
        Array.from(document.images).map((image) =>
          // `decode()` resolves once the pixels are ready to paint, which
          // `complete` alone does not promise. A failed image resolves too —
          // one broken photo must not hold an entire book hostage.
          image.decode().catch(() => undefined),
        ),
      );

    void Promise.all([document.fonts.ready, imagesDecoded()]).then(() => {
      if (cancelled) return;
      timer = window.setTimeout(signal, EXPORT_READY_FALLBACK_MS);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(signal);
      });
    });

    return () => {
      cancelled = true;
      done = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [contentReady]);
}

function CoverWrapDocument({ payload }: { payload: ExportPayload }) {
  const { project } = payload;
  const preset = getCookbookPreset(payload.preset);
  const template = isRecipePrintTemplate(project.settings.template)
    ? project.settings.template
    : "classic";
  const geometry = coverWrapGeometry(preset, payload.pageCount ?? 0);
  const cover = project.cover;

  useExportReady(Boolean(cover));

  const wrapStyle = {
    "--rp-wrap-w": `${geometry.sheetWidthIn}in`,
    "--rp-wrap-h": `${geometry.sheetHeightIn}in`,
    "--rp-wrap-panel-w": `${geometry.panelWidthIn}in`,
    "--rp-wrap-panel-h": `${geometry.panelHeightIn}in`,
    "--rp-wrap-allowance": `${geometry.wrapAllowanceIn}in`,
    "--rp-sheet-w": geometry.sheetWidthIn,
    "--rp-sheet-h": geometry.sheetHeightIn,
  } as CSSProperties;

  // No cover means no wrap to draw. Guarded after the hook so the hook order is
  // stable, and before `backCover` so its fallback has a defined cover to use.
  if (!cover) return null;
  const backCover = project.backCover ?? cover;

  return (
    <div
      className="recipe-page-deck rp-exporting rp-page-cover-wrap"
      style={wrapStyle}
      data-export-root="true"
    >
      {/* The wrap's sheet size depends on the book's page count, so it cannot
          be one of the static `@page` rules in print.css. Custom properties do
          not cascade into `@page` reliably across engines, so the rule is
          emitted with its literal inches. This matters only once the renderer
          honours the page's own box (see `preferCSSPageSize` in
          docs/cookbook-pdf-export.md); until then it is what makes the on-screen
          preview and a plain Ctrl+P come out at wrap size. */}
      <style>{`
        @page rp-preset-cover-wrap {
          size: ${geometry.sheetWidthIn}in ${geometry.sheetHeightIn}in;
          margin: 0;
        }
        .rp-page-cover-wrap .cookbook-wrap { page: rp-preset-cover-wrap; }
      `}</style>
      {/* Same theme scoping the interior uses (see ScaledPage): the palette
          custom properties live on `.recipe-card-set`, with `.recipe-template--*`
          overriding them. Without both, a cover panel renders with no paper
          colour at all. */}
      <div
        className={`cookbook-wrap recipe-card-set recipe-card-set--letter recipe-template--${template}`}
      >
        {/* Back cover first: a wrap is read as a flat sheet, left to right. */}
        <CoverFace cover={backCover} side="back" template={template} />
        <SpineFace
          cover={cover}
          template={template}
          spineWidthIn={geometry.spineWidthIn}
          showTitle={spineFitsTitle(geometry.spineWidthIn)}
        />
        <CoverFace cover={cover} side="front" template={template} />
        {/* Fold guides at the two board edges — screen only. */}
        <div
          className="cookbook-wrap__guide"
          style={{ left: `${geometry.wrapAllowanceIn + geometry.panelWidthIn}in` }}
        />
        <div
          className="cookbook-wrap__guide"
          style={{ left: `${geometry.frontPanelOffsetIn}in` }}
        />
      </div>
    </div>
  );
}

function InteriorDocument({ payload }: { payload: ExportPayload }) {
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

  useExportReady(printLayoutReady && sheets.length > 0);

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
