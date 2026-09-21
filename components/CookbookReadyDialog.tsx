"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/components/Dialog";
import {
  CheckIcon,
  ExternalIcon,
  ICON_SIZE,
  PrintIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/icons";
import type { PrinterOption } from "@/lib/cookbookPresets";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import { coverWrapGeometry, wrapGeometryForSpine } from "@/lib/coverWrap";
import {
  PRINT_DESTINATIONS,
  allFormats,
  destinationNote,
  destinationPresets,
  destinationPrinter as printerFor,
  destinationSettings,
  downloadSummary,
  effectiveDestination,
  exportFileRoles,
  formatOption,
  getPrintDestination,
  settingsIntro,
  type PrintDestination,
  type PrintDestinationId,
} from "@/lib/printDestinations";
import type { CoverSheetSpec } from "@/types/export";
import type { CookbookPresetId } from "@/types/recipe";

/**
 * One panel: where the book is going, and the format of the file.
 *
 * Both are always on screen. A destination is a shortcut that fills the format
 * in (Lulu wants edge-to-edge art and a separate cover; a home printer wants
 * neither), and every format stays available whichever destination is picked,
 * because we know what a shop's own form asks for far better than we know what
 * someone is actually printing. Nothing here decides for them: the destination
 * chooses where to begin, and the format is theirs to change.
 *
 * This used to be two steps, destination first and then only the books that
 * destination could make. That hid the formats behind a guess about the shop and
 * labelled them by a binding ("Spiral Cookbook") we had no way of knowing.
 */
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
  /** The export that landed, if one has. It replaces the controls until the cook
      asks to save another format. */
  lastExport?: { presetId: CookbookPresetId; files: string[] } | null;
  /** Clears that finished export, putting the controls back. */
  onExportAnother?: () => void;
}) {
  // Both optional: somebody can pick a format without saying where it goes.
  const [destinationId, setDestinationId] = useState<PrintDestinationId | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<CookbookPresetId | null>(null);
  useEffect(() => {
    if (!open) {
      setDestinationId(null);
      setSelectedPresetId(null);
    }
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
   * Picking a destination fills the format in with the one it is set up for.
   * That is a starting point, not a lock: the format list below stays open.
   */
  const chooseDestination = (id: PrintDestinationId) => {
    setDestinationId(id);
    setSelectedPresetId(destinationPresets(getPrintDestination(id))[0].id);
    onExportAnother?.();
  };
  const chooseFormat = (id: CookbookPresetId) => {
    setSelectedPresetId(id);
    onExportAnother?.();
  };
  const destination = destinationId ? getPrintDestination(destinationId) : null;

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
        <span className="cookbook-ready__title">
          <h2 id="cookbook-ready-title">
            {justPurchased ? "Your cookbook is ready 🎉" : "Print your cookbook"}
          </h2>
        </span>
      </div>

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
        {lastExport ? (
          /* Done. A finished PDF is only half of it: the file is correct
             against exactly one set of order options, and none of them are
             visible by opening it. So they are stated here, at the moment they
             are about to be used. */
          <ExportedNext
            destination={destination}
            lastExport={lastExport}
            onPrinterClick={onPrinterClick}
            onExportAnother={onExportAnother}
          />
        ) : (
          <ChooseBook
            destination={destination}
            onChooseDestination={chooseDestination}
            selectedPresetId={selectedPresetId}
            onChooseFormat={chooseFormat}
            coverSizes={coverSizes}
            setCoverField={setCoverField}
            pageCount={pageCount}
            exportingPreset={exportingPreset}
            onExport={onExport}
            onPrinterClick={onPrinterClick}
          />
        )}
      </div>
    </Dialog>
  );
}

/**
 * The controls: where it is going, which format, the cover size if one travels
 * separately, and the button.
 *
 * The four formats are genuinely different files, not labels on the same one.
 * A book with a spine margin carries a half-inch inset on the bound edge
 * because the spine swallows it, and its cover wrap is a different sheet
 * entirely — around 19 × 12.75in over boards, against 17.75 × 11.25 printed
 * flat. So the choice is stated plainly rather than made quietly.
 */
function ChooseBook({
  destination,
  onChooseDestination,
  selectedPresetId,
  onChooseFormat,
  coverSizes,
  setCoverField,
  pageCount,
  exportingPreset,
  onExport,
  onPrinterClick,
}: {
  destination: PrintDestination | null;
  onChooseDestination: (id: PrintDestinationId) => void;
  selectedPresetId: CookbookPresetId | null;
  onChooseFormat: (id: CookbookPresetId) => void;
  coverSizes: Record<string, { w: string; h: string; spine: string }>;
  setCoverField: (presetId: string, field: "w" | "h" | "spine", value: string) => void;
  pageCount: number;
  exportingPreset: CookbookPresetId | null;
  onExport: (presetId: CookbookPresetId, coverSheet?: CoverSheetSpec) => void;
  onPrinterClick: (printer: string, url: string) => void;
}) {
  const formats = allFormats();
  const preset = formats.find((option) => option.id === selectedPresetId) ?? null;
  const busy = exportingPreset !== null;
  const printer = destination ? printerFor(destination) : undefined;
  const note = preset ? destinationNote(destination, preset) : null;

  const num = (raw: string, fallback: number) => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const round = (value: number) => String(Number(value.toFixed(3)));
  const size = (preset && coverSizes[preset.id]) ?? { w: "", h: "", spine: "" };
  // The spine drives the sheet: it is the only part of a cover a print service
  // will not publish a formula for.
  const wrap = preset?.wrapRequired ? preset : null;
  const spineIn = wrap ? num(size.spine, coverWrapGeometry(wrap, pageCount).spineWidthIn) : 0;
  const derived = wrap ? wrapGeometryForSpine(wrap, spineIn) : null;
  const shown = derived
    ? {
        spine: size.spine || round(spineIn),
        w: size.w || round(derived.sheetWidthIn),
        h: size.h || round(derived.sheetHeightIn),
      }
    : { spine: "", w: "", h: "" };
  const statedSheet: CoverSheetSpec | undefined = derived
    ? {
        widthIn: num(size.w, derived.sheetWidthIn),
        heightIn: num(size.h, derived.sheetHeightIn),
        spineWidthIn: spineIn,
      }
    : undefined;
  // Only claim the shop states its own numbers where it is set up for this
  // format. Anywhere else the numbers come off whatever upload page they use.
  const shopStatesNumbers = Boolean(
    destination &&
      preset &&
      !destination.unknownSpec &&
      destination.presetIds.includes(preset.id),
  );

  return (
    <>
      <p className="cookbook-ready__lead">
        Pick where you’re printing and we’ll fill in the settings. You can change any of them.
      </p>

      <div className="cookbook-binding" role="radiogroup" aria-label="Where you’re printing">
        {PRINT_DESTINATIONS.map((option) => (
          <label
            key={option.id}
            className={`cookbook-binding__option${option.id === destination?.id ? " is-active" : ""}`}
          >
            <input
              type="radio"
              name="cookbook-destination"
              value={option.id}
              checked={option.id === destination?.id}
              disabled={busy}
              onChange={() => onChooseDestination(option.id)}
            />
            {option.name}
          </label>
        ))}
      </div>

      {destination && (destination.tagline || printer) && (
        <p className="cookbook-ready__subtitle cookbook-ready__place">
          {destination.tagline}
          {printer && (
            <button
              type="button"
              className="cookbook-next__another"
              onClick={() => onPrinterClick(printer.id, printer.url)}
            >
              Open {printer.name}
              <ExternalIcon size={ICON_SIZE.sm} />
            </button>
          )}
        </p>
      )}

      <p className="cookbook-ready__lead">What are you making?</p>
      <div className="cookbook-format-list" role="radiogroup" aria-label="What you are making">
        {formats.map((option) => {
          const copy = formatOption(option);
          const active = option.id === preset?.id;
          return (
            <label key={option.id} className={`cookbook-format${active ? " is-active" : ""}`}>
              <input
                type="radio"
                name="cookbook-format"
                value={option.id}
                checked={active}
                disabled={busy}
                onChange={() => onChooseFormat(option.id)}
              />
              <strong>{copy.title}</strong>
              <small>{copy.detail}</small>
            </label>
          );
        })}
      </div>

      {/* Quiet, and only where the format is not the one this destination is set
          up for. Never a block: the cook can save whatever they chose. */}
      {note && <p className="cookbook-ready__note">{note}</p>}

      {/* Only where a cover travels on its own. A book with the cover as its
          first page has no cover sheet to size and nothing to read. */}
      {wrap && (
        <div className="cookbook-cover-size">
          <span className="cookbook-cover-size__label">Cover size</span>
          {/* Above the fields, not below them. The rest of the app explains a
              control before you reach it — `cp-menu__item--stacked` and the
              hinted `Checkbox` both read label, note, control — and an
              instruction printed underneath three inputs is an instruction you
              find out you needed after typing in them. */}
          <span className="cookbook-cover-size__hint">
            {shopStatesNumbers && destination
              ? `Only if ${destination.name} states different numbers.`
              : "Copy these from your printer’s upload page."}
          </span>
          {/* Sheet first, spine last: that is the order a print service states
              them in, and reading them back off their page in a different
              order is how a number lands in the wrong box. */}
          <span className="cookbook-cover-size__fields">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Cover width in inches"
              value={shown.w}
              disabled={busy}
              onChange={(event) => setCoverField(wrap.id, "w", event.target.value)}
            />
            <span aria-hidden>×</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Cover height in inches"
              value={shown.h}
              disabled={busy}
              onChange={(event) => setCoverField(wrap.id, "h", event.target.value)}
            />
            <span className="cookbook-cover-size__unit" aria-hidden>
              in, spine
            </span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Spine width in inches"
              value={shown.spine}
              disabled={busy}
              onChange={(event) => setCoverField(wrap.id, "spine", event.target.value)}
            />
            <span className="cookbook-cover-size__unit">in</span>
          </span>
        </div>
      )}

      <p className="cookbook-ready__downloads">
        {preset
          ? downloadSummary(effectiveDestination(destination, preset), preset)
          : "Choose where you’re printing, or what you’re making, to save your book."}
      </p>

      <button
        type="button"
        className="btn btn-primary cookbook-ready__save"
        disabled={busy || !preset}
        onClick={() => preset && onExport(preset.id, statedSheet)}
      >
        {preset && exportingPreset === preset.id ? (
          <>
            <SpinnerIcon size={ICON_SIZE.md} />
            Preparing…
          </>
        ) : (
          <>
            <PrintIcon size={ICON_SIZE.md} />
            Save PDF
          </>
        )}
      </button>
    </>
  );
}

/**
 * What to do with the files that just landed, in the row they came from.
 *
 * Everything here is derived from the destination and the preset that was
 * rendered, never from what was on screen when the button was pressed — the
 * cook can change the cover fields, pick the other binding, and this still
 * describes the file in their downloads folder rather than the one they were
 * looking at.
 */
function ExportedNext({
  destination: chosen,
  lastExport,
  onPrinterClick,
  onExportAnother,
}: {
  destination: PrintDestination | null;
  lastExport: { presetId: CookbookPresetId; files: string[] };
  onPrinterClick: (printer: string, url: string) => void;
  onExportAnother?: () => void;
}) {
  const preset = getCookbookPreset(lastExport.presetId);
  const destination = effectiveDestination(chosen, preset);
  const printer: PrinterOption | undefined = chosen ? printerFor(chosen) : undefined;
  const roles = exportFileRoles(lastExport.files.length);
  return (
    <>
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
        <p className="cookbook-ready__lead">{settingsIntro(destination, preset)}</p>
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
        {onExportAnother && (
          <button type="button" className="cookbook-next__another" onClick={onExportAnother}>
            Save another format
          </button>
        )}
      </div>
    </>
  );
}
