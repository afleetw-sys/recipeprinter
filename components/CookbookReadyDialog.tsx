"use client";

import { Dialog } from "@/components/Dialog";
import { CookbookMockup } from "@/components/CookbookWelcomeDialog";
import { CheckIcon, ICON_SIZE, PrintIcon, XIcon } from "@/components/icons";
import { COOKBOOK_PRESETS, PRINTERS } from "@/lib/cookbookPresets";
import type { CookbookPresetId, CoverConfig } from "@/types/recipe";

export function CookbookReadyDialog({
  open,
  justPurchased,
  cover,
  onClose,
  onExport,
  onPrinterClick,
}: {
  open: boolean;
  justPurchased: boolean;
  cover: CoverConfig;
  onClose: () => void;
  onExport: (presetId: CookbookPresetId) => void;
  onPrinterClick: (printer: string, url: string) => void;
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
      <div className="cookbook-ready__hero">
        <div className="cookbook-ready__mockups">
          <CookbookMockup cover={cover} compact />
          <div className="cookbook-ready__spread" aria-hidden>
            <div><span>Contents</span><i /></div>
            <div><strong>{cover.title || "My Cookbook"}</strong><i /><i /><i /></div>
          </div>
        </div>
        <div>
          <span className="cookbook-ready__eyebrow">{justPurchased ? "Beautifully done" : "Ready to print again"}</span>
          <h2 id="cookbook-ready-title">Your cookbook is ready.</h2>
          <p>It&apos;s permanently unlocked, every format is included, and you can export again after future edits.</p>
          <div className="cookbook-ready__assurances">
            {["This cookbook is yours", "All print formats included", "Re-export anytime"].map((item) => (
              <span key={item}><CheckIcon size={ICON_SIZE.xs} />{item}</span>
            ))}
          </div>
        </div>
      </div>

      <section className="cookbook-ready__section">
        <h3>Choose your finished format</h3>
        <div className="cookbook-ready__formats">
          {COOKBOOK_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="cookbook-format-card" onClick={() => onExport(preset.id)}>
              <span className="cookbook-format-card__paper" aria-hidden />
              <span>
                <strong>{preset.productName}</strong>
                <small>{preset.trimLabel} · {preset.bestFor}</small>
              </span>
              <PrintIcon size={ICON_SIZE.md} />
            </button>
          ))}
        </div>
      </section>

      <section className="cookbook-ready__section">
        <h3>Bring it to life</h3>
        <div className="cookbook-ready__recommendations">
          <div><strong>Print at home</strong><span>Best for spiral binding and everyday kitchen copies.</span></div>
          <div><strong>Local print shop</strong><span>Ask for double-sided color printing with sturdy covers.</span></div>
          {Object.values(PRINTERS).map((printer) => (
            <button type="button" key={printer.id} onClick={() => onPrinterClick(printer.id, printer.url)}>
              <strong>{printer.name}</strong>
              <span>{printer.note}</span>
            </button>
          ))}
        </div>
      </section>
    </Dialog>
  );
}
