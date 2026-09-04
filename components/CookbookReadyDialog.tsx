"use client";

import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { COOKBOOK_PRESETS, PRINTERS } from "@/lib/cookbookPresets";
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
        {COOKBOOK_PRESETS.map((preset) => {
          // Where this particular book can actually be made. Read off the
          // preset rather than listing every shop we know: Blurb does not bind
          // coil at all and Lulu has no 8 × 10 trim, so an undifferentiated
          // list sent people to a printer that could not take their file.
          const printers = preset.printerIds
            .map((id) => PRINTERS[id])
            .filter((printer): printer is NonNullable<typeof printer> => Boolean(printer));
          return (
            <div className="cookbook-format" key={preset.id}>
              <button
                type="button"
                className="cookbook-format-card"
                disabled={exportingPreset !== null}
                onClick={() => onExport(preset.id)}
              >
                <span className="cookbook-format-card__text">
                  <strong>{preset.productName}</strong>
                  <small>{preset.bestFor}</small>
                </span>
                <span className="cookbook-format-card__cta">
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
                </span>
              </button>
              <p className="cookbook-format__where">
                {/* Said per format, because it is a property of the format and
                    not a caveat. A print service wants the pages and the cover
                    as two files, so these two save two files, and someone who
                    is not told that will go looking for the missing one. */}
                {preset.wrapRequired
                  ? "Saves two files, pages and cover, the way a print service asks for them. Upload at "
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
