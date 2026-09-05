"use client";

import { useState } from "react";

import { Checkbox } from "@/components/Controls";
import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { COOKBOOK_FORMATS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import { coverWrapGeometry, wrapGeometryForSpine } from "@/lib/coverWrap";
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
  // Which size is chosen within each kind of book. Absent means the kind's
  // first, which is the only answer a one-size kind ever has.
  const [sizes, setSizes] = useState<Record<string, CookbookPresetId>>({});
  const [coverSizes, setCoverSizes] = useState<
    Record<string, { w: string; h: string; spine: string }>
  >({});
  const setCoverField = (presetId: string, field: "w" | "h" | "spine", value: string) =>
    setCoverSizes((current) => ({
      ...current,
      [presetId]: { ...(current[presetId] ?? { w: "", h: "", spine: "" }), [field]: value },
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
          // The size chosen within this kind of book, defaulting to the first
          // offered. A kind with one size never asks.
          const sizeId = sizes[format.id] ?? format.presetIds[0];
          const base = getCookbookPreset(sizeId);
          // A print-service variant is the same size drawn on a bigger sheet
          // with its cover handed over separately — reached by ticking the
          // option, never by picking it from a list.
          const variant = base.printServicePresetId
            ? getCookbookPreset(base.printServicePresetId)
            : null;
          const preset = variant && forPrintService ? variant : base;

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

          const num = (raw: string, fallback: number) => {
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
          };
          // Keyed by PRESET, not by kind: the two hardcover sizes have
          // different wraps, so a spine typed for one says nothing about the
          // other.
          const size = coverSizes[preset.id] ?? { w: "", h: "", spine: "" };
          // The spine drives the sheet, because it is the only part of a cover
          // a print service will not publish a formula for. Lulu states its
          // wrap allowance and board overhang outright and generates the spine
          // from your interior after upload, so this is the one figure to copy.
          const round = (value: number) => String(Number(value.toFixed(3)));
          const spineIn = num(size.spine, coverWrapGeometry(preset, pageCount).spineWidthIn);
          const derived = wrapGeometryForSpine(preset, spineIn);
          // Shown as real values, not ghosted placeholders. A placeholder reads
          // as "nothing here yet" — which is exactly wrong, because these ARE
          // the numbers the file will be built to, and for a format whose
          // printer publishes its anatomy they are the printer's own. Typing
          // over any of them wins; clearing one puts the derivation back.
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
          const oneSize = format.presetIds.length === 1;

          return (
            <div className="cookbook-format" key={format.id}>
              <div className="cookbook-format__head">
                <span className="cookbook-format__text">
                  <strong>{format.name}</strong>
                  {/* With one size there is no picker below to carry the trim,
                      so the subtitle carries it instead. */}
                  <small>{oneSize ? base.trimLabel : format.tagline}</small>
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

              <div className="cookbook-format__foot">
                {!oneSize && (
                  <div className="cookbook-size" role="radiogroup" aria-label={`${format.name} size`}>
                    {format.presetIds.map((id) => {
                      const option = getCookbookPreset(id);
                      const active = id === sizeId;
                      return (
                        <label
                          key={id}
                          className={`cookbook-size__option${active ? " is-active" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`size-${format.id}`}
                            checked={active}
                            disabled={exportingPreset !== null}
                            onChange={() => setSizes((c) => ({ ...c, [format.id]: id }))}
                          />
                          <span>{option.trimLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* A checkbox only where there is something to decide. A spiral
                    cookbook can keep its cover bound in or hand it over
                    separately, so that is a real choice; a hardcover has no
                    version that keeps it, so a box you cannot untick would be
                    asking a question with one answer. It states the fact
                    instead. */}
                {variant ? (
                  <Checkbox
                    checked={forPrintService}
                    disabled={exportingPreset !== null}
                    onChange={(event) => setForPrintService(event.target.checked)}
                    label="Cover as a separate file"
                    hint={
                      <>
                        {printerLink(variant.printerIds[0])} needs this;{" "}
                        {printerLink(base.printerIds[0])} and home printing don’t.
                      </>
                    }
                  />
                ) : (
                  <p className="cookbook-format__note">
                    Downloads as two files, pages and cover, for{" "}
                    {printerLink(preset.printerIds[0])}.
                  </p>
                )}

                {preset.wrapRequired && (
                  <div className="cookbook-cover-size">
                    {/* Open, not folded away. These are the numbers the file is
                        actually built to, and a wrong cover size is a rejected
                        order rather than a slightly wrong book — so they are
                        worth seeing before pressing Save, not after. */}
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
                      Only change these if your printer states different ones.
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
