"use client";

import { useState } from "react";

import { Checkbox } from "@/components/Controls";
import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { COOKBOOK_FORMATS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import type { CookbookPresetId } from "@/types/recipe";

export function CookbookReadyDialog({
  open,
  justPurchased,
  onClose,
  onExport,
  onPrinterClick,
  exportingPreset,
  exportError,
  exportNeedsAuth = false,
  exportNeedsAccount = false,
  onSignIn,
}: {
  open: boolean;
  justPurchased: boolean;
  onClose: () => void;
  onExport: (presetId: CookbookPresetId) => void;
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
                  onClick={() => onExport(preset.id)}
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
              </div>
            </div>
          );
        })}
      </div>

    </Dialog>
  );
}
