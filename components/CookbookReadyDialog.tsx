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
        <p>Choose a format. Every format is included, and you can export again anytime.</p>
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
          // other depending on the option below it — same book, different sheet
          // and a cover that is either bound in or handed over separately.
          const usingService = Boolean(format.printServicePresetId) && forPrintService;
          const preset = usingService
            ? getCookbookPreset(format.printServicePresetId)
            : format;
          // Where this book can actually be made. Read off the preset rather
          // than listing every shop we know: Blurb binds no coil at all and
          // Lulu has no 8 × 10 trim, so an undifferentiated list sent people to
          // a printer that could not take their file.
          const printers = preset.printerIds
            .map((id) => PRINTERS[id])
            .filter((printer): printer is NonNullable<typeof printer> => Boolean(printer));
          const busy = exportingPreset === preset.id;
          return (
            <div className="cookbook-format" key={format.id}>
              <button
                type="button"
                className="cookbook-format-card"
                disabled={exportingPreset !== null}
                onClick={() => onExport(preset.id)}
              >
                <span className="cookbook-format-card__text">
                  <strong>{format.productName}</strong>
                  <small>{format.trimLabel}</small>
                </span>
                <span className="cookbook-format-card__cta">
                  {busy ? (
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
                </span>
              </button>

              {format.printServicePresetId && (
                <Checkbox
                  className="cookbook-format__option"
                  checked={forPrintService}
                  disabled={exportingPreset !== null}
                  onChange={(event) => setForPrintService(event.target.checked)}
                  label="Save the cover as its own file"
                  hint={
                    // Named for what it produces, not for where it is going.
                    // "Sending this to a print shop" was the obvious label and
                    // it is not true: Staples is a print shop and takes the
                    // single file above quite happily. The thing that actually
                    // varies between services is whether they want the cover
                    // handed over separately, so that is what the box says, and
                    // the hint names one of each so nobody has to guess which
                    // kind theirs is.
                    "Print-on-demand services like Lulu want the pages and the cover as two uploads, with photos running past the trim edge. Copy shops like Staples take the single file above. Your printer’s upload page will say which it wants."
                  }
                />
              )}

              <p className="cookbook-format__where">
                {preset.wrapRequired
                  ? "Saves two files, the pages and the cover. Upload them at "
                  : "Print it at home, or upload it at "}
                {printers.map((printer, index) => (
                  <span key={printer.id}>
                    <button
                      type="button"
                      className="cookbook-ready__printer-link"
                      onClick={() => onPrinterClick(printer.id, printer.url)}
                    >
                      {printer.name}
                    </button>
                    {index < printers.length - 1
                      ? index === printers.length - 2
                        ? " or "
                        : ", "
                      : "."}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
      </div>

      {/* The per-format lines above carry the destinations now — a single
          sentence listing every shop could not say that Blurb has no coil
          binding and Lulu has no 8 × 10, so it recommended both for both.
          What is left here is the one thing true of every format: we do not
          upload anything for you. */}
      <p className="cookbook-ready__note">
        We don’t send anything anywhere. Saving puts the files on this device,
        and you upload them yourself.
      </p>
    </Dialog>
  );
}
