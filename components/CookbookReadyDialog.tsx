"use client";

import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, PrintIcon, XIcon } from "@/components/icons";
import { COOKBOOK_PRESETS, PRINTERS } from "@/lib/cookbookPresets";
import type { CookbookPresetId } from "@/types/recipe";

export function CookbookReadyDialog({
  open,
  justPurchased,
  onClose,
  onExport,
  onPrinterClick,
}: {
  open: boolean;
  justPurchased: boolean;
  onClose: () => void;
  onExport: (presetId: CookbookPresetId) => void;
  onPrinterClick: (printer: string, url: string) => void;
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

      {/* The one instruction that decides whether the export works, stated
          where the decision is made. A cookbook page is laid out to fill its
          sheet edge to edge, which a PDF reproduces exactly and a printer
          cannot — a printer reserves an unprintable margin and rescales the
          whole page to fit inside it, which shifts every page of the book.
          The browser gives no way to preselect the destination for the user
          (`window.print()` opens on whatever they used last), so saying so
          plainly, before the dialog opens, is the only lever there is. */}
      <p className="cookbook-ready__destination" role="note">
        Your browser’s print window opens next — choose <strong>Save as PDF</strong> as the
        destination. Sending it straight to a printer rescales every page, so the layout
        won’t come out right.
      </p>

      <div className="cookbook-ready__formats">
        {COOKBOOK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cookbook-format-card"
            onClick={() => onExport(preset.id)}
          >
            <span className="cookbook-format-card__text">
              <strong>{preset.productName}</strong>
              <small>{preset.trimLabel}</small>
            </span>
            <span className="cookbook-format-card__cta">
              <PrintIcon size={ICON_SIZE.sm} />
              Save PDF
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
        Once it’s saved you can print it at home — the PDF keeps the layout — or upload it to a
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
