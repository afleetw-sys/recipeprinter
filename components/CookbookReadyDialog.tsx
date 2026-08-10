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
        <h2 id="cookbook-ready-title">{justPurchased ? "Your cookbook is ready 🎉" : "Print your cookbook"}</h2>
        <p>Choose a format to save as a PDF. Every format is included, and you can export again anytime.</p>
      </div>

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
          honest instruction is: save it first, then upload that file yourself. */}
      <p className="cookbook-ready__note">
        To make a physical copy, save the PDF first — then print it at home, or upload it to a service like{" "}
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
