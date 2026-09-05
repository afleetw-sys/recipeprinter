"use client";

import { useState } from "react";

import { Checkbox } from "@/components/Controls";
import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { COOKBOOK_FORMATS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import { coverWrapGeometry } from "@/lib/coverWrap";
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
}) {
  // One flag, not one per format: only the spiral format has a print-service
  // variant, and a book is going to one destination on any given save.
  const [forPrintService, setForPrintService] = useState(false);
  // Keyed by format, because the two do not share an answer: a wrap quoted for a
  // US Letter book says nothing about an 8 × 10 one, and one set of fields
  // filled both in with the same numbers.
  //
  // Empty means "use our estimate". Held as strings so a half-typed number
  // ("19." on the way to 19.25) is not parsed, rounded and written back under
  // the cursor.
  const [coverSizes, setCoverSizes] = useState<
    Record<string, { w: string; h: string; spine: string }>
  >({});
  const setCoverField = (formatId: string, field: "w" | "h" | "spine", value: string) =>
    setCoverSizes((current) => ({
      ...current,
      [formatId]: { ...(current[formatId] ?? { w: "", h: "", spine: "" }), [field]: value },
    }));
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
        <h2 id="cookbook-ready-title">{justPurchased ? "Your cookbook is ready 🎉" : "Save your cookbook"}</h2>
        <p>Both are included, and you can export again anytime.</p>
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

      <div className="cookbook-ready__formats">
        {COOKBOOK_FORMATS.map((format) => {
          // A format with a print-service variant exports as one preset or the
          // other depending on the option inside its card — same book,
          // different sheet, and a cover that is either bound in or handed over
          // separately.
          const variant = format.printServicePresetId
            ? getCookbookPreset(format.printServicePresetId)
            : null;
          const preset = variant && forPrintService ? variant : format;
          // Our own estimate, shown as the field placeholders so the boxes are
          // never blank and a cook who has no numbers to hand still gets a
          // plausible wrap. Typed values replace it outright.
          const estimate = coverWrapGeometry(preset, pageCount);
          const num = (raw: string, fallback: number) => {
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
          };
          const size = coverSizes[format.id] ?? { w: "", h: "", spine: "" };
          const statedSheet: CoverSheetSpec | undefined =
            size.w || size.h || size.spine
              ? {
                  widthIn: num(size.w, estimate.sheetWidthIn),
                  heightIn: num(size.h, estimate.sheetHeightIn),
                  spineWidthIn: num(size.spine, estimate.spineWidthIn),
                }
              : undefined;
          const round = (value: number) => String(Number(value.toFixed(3)));
          const printerLink = (id: string | undefined) => {
            const printer = id ? PRINTERS[id] : undefined;
            if (!printer) return null;
            return (
              <button
                type="button"
                className="cookbook-ready__printer-link"
                onClick={() => onPrinterClick(printer.id, printer.url)}
              >
                {printer.name}
              </button>
            );
          };
          return (
            <div className="cookbook-format" key={format.id}>
              <div className="cookbook-format__head">
                <span className="cookbook-format__text">
                  <strong>{format.productName}</strong>
                  <small>{format.trimLabel}</small>
                </span>
                <button
                  type="button"
                  className="cookbook-format__save"
                  disabled={exportingPreset !== null}
                  onClick={() => onExport(preset.id, preset.wrapRequired ? statedSheet : undefined)}
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

              {/* Inside the card, under a hairline, because it is a question
                  about THIS format and nothing else. Sitting outside it read as
                  a separate setting that happened to be nearby. */}
              <div className="cookbook-format__foot">
                {variant ? (
                  <Checkbox
                    checked={forPrintService}
                    disabled={exportingPreset !== null}
                    onChange={(event) => setForPrintService(event.target.checked)}
                    label="Save the cover as its own file"
                    hint={
                      // The shops are the hint, rather than a sentence about
                      // shops followed by a separate list of them. Naming one of
                      // each kind answers the only question there is, which is
                      // which kind yours is.
                      <>
                        {printerLink(variant.printerIds[0])} needs this.{" "}
                        {printerLink(format.printerIds[0])} and home printing don’t.
                      </>
                    }
                  />
                ) : (
                  <p className="cookbook-format__note">
                    Two files, pages and cover, for {printerLink(format.printerIds[0])}.
                  </p>
                )}

                {/* The printer's numbers beat ours, always. A spine depends on
                    the exact stock's caliper and, on a cased book, the boards
                    and the fold-over too — none of which we can know, and being
                    a quarter inch out gets the file rejected rather than
                    printed slightly wrong. Lulu and Blurb both print the answer
                    on the upload page, so this is a copy across, not a
                    calculation the cook has to do. */}
                {preset.wrapRequired && (
                  <div className="cookbook-cover-size">
                    <span className="cookbook-cover-size__label">
                      Cover size, if your printer states one
                    </span>
                    <span className="cookbook-cover-size__fields">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Cover width in inches"
                        placeholder={round(estimate.sheetWidthIn)}
                        value={size.w}
                        disabled={exportingPreset !== null}
                        onChange={(event) => setCoverField(format.id, "w", event.target.value)}
                      />
                      <span aria-hidden>×</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Cover height in inches"
                        placeholder={round(estimate.sheetHeightIn)}
                        value={size.h}
                        disabled={exportingPreset !== null}
                        onChange={(event) => setCoverField(format.id, "h", event.target.value)}
                      />
                      <span className="cookbook-cover-size__unit">in, spine</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Spine width in inches"
                        placeholder={round(estimate.spineWidthIn)}
                        value={size.spine}
                        disabled={exportingPreset !== null}
                        onChange={(event) => setCoverField(format.id, "spine", event.target.value)}
                      />
                      <span className="cookbook-cover-size__unit">in</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </Dialog>
  );
}
