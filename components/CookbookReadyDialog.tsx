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
  const printers = Object.values(PRINTERS);
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
        {COOKBOOK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cookbook-format-card"
            disabled={exportingPreset !== null}
            onClick={() => onExport(preset.id)}
          >
            <span className="cookbook-format-card__text">
              <strong>{preset.productName}</strong>
              <small>{preset.trimLabel}</small>
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
        ))}
      </div>

      {/* No integration with the print shops — the export is just a PDF. So the
          honest instruction is: save it first, then upload that file yourself.
          Worth stating that home printing IS fine from the saved file: the PDF
          has its geometry baked in, so a printer can only scale it uniformly —
          a slightly inset page, never the broken one it produces from the web
          page. That's the whole reason this flow is PDF-first. */}
      <p className="cookbook-ready__note">
        Once it’s saved you can print it at home, or upload it to a
        service like{" "}
        {printers.map((printer, index) => (
          <span key={printer.id}>
            <button
              type="button"
              className="cookbook-ready__printer-link"
              onClick={() => onPrinterClick(printer.id, printer.url)}
            >
              {printer.name}
            </button>
            {index < printers.length - 1 ? (index === printers.length - 2 ? ", or " : ", ") : "."}
          </span>
        ))}
      </p>
    </Dialog>
  );
}
