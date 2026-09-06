"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { coverWrapGeometry, wrapGeometryForSpine } from "@/lib/coverWrap";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import type { PrinterOption } from "@/lib/cookbookPresets";
import {
  PRINT_DESTINATIONS,
  destinationPresets,
  destinationPrinter,
  destinationSettings,
  destinationUploadsAFile,
  exportFileRoles,
  getPrintDestination,
  type PrintDestination,
  type PrintDestinationId,
} from "@/lib/printDestinations";
import type { CoverSheetSpec } from "@/types/export";
import type { CookbookPresetId } from "@/types/recipe";

export function CookbookReadyDialog({
  open,
  justPurchased,
  onClose,
  onExport,
  onPrinterClick,
  exportingPreset,
  exportError,
  pageCount = 0,
  exportNeedsAuth = false,
  exportNeedsAccount = false,
  onSignIn,
  lastExport = null,
  onExportAnother,
}: {
  open: boolean;
  justPurchased: boolean;
  onClose: () => void;
  onExport: (presetId: CookbookPresetId, coverSheet?: CoverSheetSpec) => void;
  /** Sheets in the book as previewed, used only to prefill the cover estimate.
      An approximation on purpose: the real count comes off the rendered
      interior, and the cook overwrites these fields with the printer's numbers
      anyway. */
  pageCount?: number;
  onPrinterClick: (printer: string, url: string) => void;
  /** The format currently rendering, if any — the export is a server round trip
      that cold-starts a browser, so it is measured in seconds and has to say so. */
  exportingPreset: CookbookPresetId | null;
  exportError: string | null;
  /** The export was refused because there's no account to confirm the purchase
      against — offer the way out rather than just the bad news. */
  exportNeedsAuth?: boolean;
  /** No session at all, so the way forward is making one rather than signing in. */
  exportNeedsAccount?: boolean;
  onSignIn?: () => void;
  /** The export that landed, if one has. Its presence is what turns the dialog
      from "pick a book" into "here is what to do with it". */
  lastExport?: { presetId: CookbookPresetId; files: string[] } | null;
  /** Back to the book list, keeping the destination — the purchase covers every
      format, so making a second one should not restart the flow. */
  onExportAnother?: () => void;
}) {
  // Where the book is going, and therefore what shape it has to be. Null is the
  // first screen.
  const [destinationId, setDestinationId] = useState<PrintDestinationId | null>(null);
  // Back to the first screen whenever the dialog closes, so reopening it never
  // lands mid-flow on a destination chosen days ago.
  useEffect(() => {
    if (!open) setDestinationId(null);
  }, [open]);

  // Keyed by PRESET: two books do not share an answer, because a wrap quoted
  // for a US Letter book says nothing about an 8 × 10 one.
  //
  // Empty means "use our figure". Held as strings so a half-typed number ("19."
  // on the way to 19.25) is not parsed, rounded and written back under the
  // cursor.
  const [coverSizes, setCoverSizes] = useState<
    Record<string, { w: string; h: string; spine: string }>
  >({});
  const setCoverField = (presetId: string, field: "w" | "h" | "spine", value: string) =>
    setCoverSizes((current) => ({
      ...current,
      [presetId]: { ...(current[presetId] ?? { w: "", h: "", spine: "" }), [field]: value },
    }));
  /**
   * Move between steps, forgetting any finished export on the way.
   *
   * The saved files belong to one destination. Leaving them on screen while the
   * destination changes produced the worst possible version of this screen: two
   * print-ready files, correct for Lulu, listed under "My own printer" beside
   * instructions for a desktop printer that will not accept either of them.
   */
  const goToDestination = (id: PrintDestinationId | null) => {
    setDestinationId(id);
    onExportAnother?.();
  };
  const destination = destinationId ? getPrintDestination(destinationId) : null;
  const printer = destination ? destinationPrinter(destination) : undefined;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="cookbook-ready-title"
      className="cookbook-ready no-print"
      backdropClassName="cookbook-ready__backdrop"
      panelClassName="cookbook-ready__panel"
      portal
    >
      <button type="button" className="cookbook-ready__close icon-close-btn" aria-label="Close" onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </button>

      <div className="cookbook-ready__head">
        <h2 id="cookbook-ready-title">
          {lastExport
            ? "Saved to your downloads"
            : justPurchased
              ? "Your cookbook is ready 🎉"
              : "Save your cookbook"}
        </h2>
      </div>

      {/* The "choose Save as PDF, and don't send it to a printer" note used to
          live here. It existed only because `window.print()` handed the
          destination to the browser and no page can preselect it — so the
          correctness of a paid export rested on someone reading a paragraph.
          The file is now rendered server-side and downloaded, so there is no
          destination to choose and nothing to warn about. */}
      {exportError && (
        <div className="cookbook-ready__error" role="alert">
          <p>{exportError}</p>
          {exportNeedsAuth && onSignIn && (
            <button type="button" className="btn btn-primary btn-compact" onClick={onSignIn}>
              {exportNeedsAccount ? "Create free account" : "Sign in"}
            </button>
          )}
        </div>
      )}

      {destination !== null && lastExport ? (
        /* Step three, and the one that was missing.
           A finished PDF is only half of it: the file is correct against
           exactly one set of order options, and none of them are visible by
           opening it. Uploading our bleed book as an 8 x 10, or handing a
           print service the single bundled file it will not take, produces a
           rejection notice that names dimensions and explains nothing. So the
           settings are stated here, at the one moment they are about to be
           used, derived from the book that was actually rendered. */
        <ExportedNext
          destination={destination}
          lastExport={lastExport}
          printer={printer}
          onPrinterClick={onPrinterClick}
          onExportAnother={onExportAnother}
          onBack={() => goToDestination(null)}
        />
      ) : destination === null ? (
        /* Step one. The only question that has to come first: everything the
           file needs — bleed, one file or two, the cover's size — follows from
           the answer, and none of it is knowable from "which book?". */
        <div className="cookbook-ready__destinations">
          <p className="cookbook-ready__lead">Where are you printing this?</p>
          {PRINT_DESTINATIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="cookbook-destination"
              onClick={() => goToDestination(option.id)}
            >
              <strong>{option.name}</strong>
              <small>{option.tagline}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="cookbook-ready__formats">
          <button
            type="button"
            className="cookbook-ready__back"
            disabled={exportingPreset !== null}
            onClick={() => goToDestination(null)}
          >
            ‹ {destination.name}
          </button>

          {destinationPresets(destination).map((preset) => {
            const num = (raw: string, fallback: number) => {
              const parsed = Number.parseFloat(raw);
              return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
            };
            const size = coverSizes[preset.id] ?? { w: "", h: "", spine: "" };
            const round = (value: number) => String(Number(value.toFixed(3)));
            // The spine drives the sheet: it is the only part of a cover a
            // print service will not publish a formula for.
            const spineIn = num(size.spine, coverWrapGeometry(preset, pageCount).spineWidthIn);
            const derived = wrapGeometryForSpine(preset, spineIn);
            const shown = {
              spine: size.spine || round(spineIn),
              w: size.w || round(derived.sheetWidthIn),
              h: size.h || round(derived.sheetHeightIn),
            };
            const statedSheet: CoverSheetSpec = {
              widthIn: num(size.w, derived.sheetWidthIn),
              heightIn: num(size.h, derived.sheetHeightIn),
              spineWidthIn: spineIn,
            };
            return (
              <div className="cookbook-format" key={preset.id}>
                <div className="cookbook-format__head">
                  <span className="cookbook-format__text">
                    <strong>{preset.productName}</strong>
                    <small>{preset.trimLabel}</small>
                  </span>
                  <button
                    type="button"
                    className="cookbook-format__save"
                    disabled={exportingPreset !== null}
                    onClick={() =>
                      onExport(preset.id, preset.wrapRequired ? statedSheet : undefined)
                    }
                  >
                    {exportingPreset === preset.id ? (
                      <>
                        <SpinnerIcon size={ICON_SIZE.sm} />
                        Preparing…
                      </>
                    ) : (
                      <>
                        <PrintIcon size={ICON_SIZE.sm} />
                        Save PDF
                      </>
                    )}
                  </button>
                </div>

                <div className="cookbook-format__foot">
                  <p className="cookbook-format__note">
                    {preset.wrapRequired
                      ? "Downloads as two files, the pages and the cover."
                      : "Downloads as one file, with the cover as its first page."}
                  </p>

                  {/* Only where a cover travels on its own. A copy shop binds
                      the document you hand it, so there is no cover sheet to
                      size and nothing here to read. */}
                  {preset.wrapRequired && (
                    <div className="cookbook-cover-size">
                      <span className="cookbook-cover-size__label">Cover size</span>
                      <span className="cookbook-cover-size__fields">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Spine width in inches"
                          value={shown.spine}
                          disabled={exportingPreset !== null}
                          onChange={(event) => setCoverField(preset.id, "spine", event.target.value)}
                        />
                        <span className="cookbook-cover-size__unit" aria-hidden>
                          in spine, cover
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Cover width in inches"
                          value={shown.w}
                          disabled={exportingPreset !== null}
                          onChange={(event) => setCoverField(preset.id, "w", event.target.value)}
                        />
                        <span aria-hidden>×</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Cover height in inches"
                          value={shown.h}
                          disabled={exportingPreset !== null}
                          onChange={(event) => setCoverField(preset.id, "h", event.target.value)}
                        />
                        <span className="cookbook-cover-size__unit">in</span>
                      </span>
                      <span className="cookbook-cover-size__hint">
                        {destination.unknownSpec
                          ? "Copy these from your printer’s upload page."
                          : "Only change these if your printer states different ones."}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </Dialog>
  );
}

/**
 * What to do with the files that just landed.
 *
 * Everything here is derived from the destination and the preset that was
 * rendered, never from what was on screen when the button was pressed — the
 * cook can change the cover fields, go back, pick the other binding, and this
 * still describes the file in their downloads folder rather than the one they
 * were looking at.
 */
function ExportedNext({
  destination,
  lastExport,
  printer,
  onPrinterClick,
  onExportAnother,
  onBack,
}: {
  destination: PrintDestination;
  lastExport: { presetId: CookbookPresetId; files: string[] };
  printer?: PrinterOption;
  onPrinterClick: (printer: string, url: string) => void;
  onExportAnother?: () => void;
  onBack: () => void;
}) {
  const preset = getCookbookPreset(lastExport.presetId);
  const roles = exportFileRoles(lastExport.files.length);
  const uploads = destinationUploadsAFile(destination);
  // Only where there is a second book to save. Offering "another format" to a
  // destination that binds exactly one thing sends people back to a list of
  // one, which reads as a mistake on our part.
  const hasAnotherFormat = destinationPresets(destination).length > 1;
  return (
    <div className="cookbook-next">
      <button type="button" className="cookbook-ready__back" onClick={onBack}>
        ‹ {destination.name}
      </button>

      <ul className="cookbook-next__files">
        {lastExport.files.map((file, index) => (
          <li key={file}>
            <CheckIcon size={ICON_SIZE.sm} />
            <span className="cookbook-next__file-name">{file}</span>
            {/* Only worth labelling when there are two of them and the upload
                form asks for each separately. One file has no counterpart to be
                confused with. */}
            {lastExport.files.length > 1 && (
              <span className="cookbook-next__file-role">{roles[index]}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="cookbook-next__settings">
        <p className="cookbook-ready__lead">
          {uploads
            ? `${printer ? printer.name : "Your print service"} will ask for:`
            : "When you print it:"}
        </p>
        <dl>
          {destinationSettings(destination, preset).map((setting) => (
            <div key={setting.label}>
              <dt>{setting.label}</dt>
              <dd>{setting.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="cookbook-next__actions">
        {printer && (
          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={() => onPrinterClick(printer.id, printer.url)}
          >
            Open {printer.name}
          </button>
        )}
        {onExportAnother && hasAnotherFormat && (
          <button type="button" className="cookbook-next__another" onClick={onExportAnother}>
            Save another format
          </button>
        )}
      </div>
    </div>
  );
}
