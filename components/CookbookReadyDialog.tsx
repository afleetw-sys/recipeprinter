"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/components/Dialog";
import {
  CheckIcon,
  GlobeIcon,
  ICON_SIZE,
  PrintIcon,
  SpinnerIcon,
  StorefrontIcon,
  XIcon,
} from "@/components/icons";
import type { PrinterOption } from "@/lib/cookbookPresets";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import { coverWrapGeometry, wrapGeometryForSpine } from "@/lib/coverWrap";
import {
  PRINT_DESTINATIONS,
  bindingLabels,
  destinationPresets,
  destinationPrinter,
  destinationSettings,
  destinationUploadsAFile,
  exportFileRoles,
  getPrintDestination,
  type PrintDestination,
  type PrintDestinationId,
} from "@/lib/printDestinations";
import type { CoverSheetSpec } from "@/types/export";
import type { CookbookPresetId } from "@/types/recipe";

/**
 * Where the finished cookbook is going, and the file that suits it.
 *
 * Two steps, and the order is the point. Everything the file needs — bleed,
 * one file or two, the cover's size — follows from where it is going, and none
 * of it is knowable from "which book?". So the destination is asked first and
 * the second step only ever offers books that destination can actually make.
 *
 * Step two used to lay every book out as its own card, which printed the same
 * "two files" note, the same cover-size hint and the same Save button once per
 * book, leaving the one line that differed — spiral or hardcover — to be found
 * among the repeats. It is one card now, with the binding on a radio and the
 * cover size disclosed for the chosen book alone.
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
  /** The export that landed, if one has. It shows inside the row it came from. */
  lastExport?: { presetId: CookbookPresetId; files: string[] } | null;
  /** Clears that finished export, putting the row back to its controls. */
  onExportAnother?: () => void;
}) {
  // Where the book is going, and therefore what shape it has to be. Null is
  // step one.
  const [destinationId, setDestinationId] = useState<PrintDestinationId | null>(null);
  // Which binding, within the open row. Null means "whatever it leads with".
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
   * Move between steps, forgetting any finished export on the way.
   *
   * The saved files belong to one destination. Leaving them on screen while the
   * destination changes produced the worst possible version of this screen: two
   * print-ready files, correct for Lulu, listed under "My own printer" beside
   * instructions for a desktop printer that will not accept either of them.
   *
   * The chosen binding goes with them — carrying it across would land on one
   * the new destination does not offer, since Blurb binds no coil and a copy
   * shop has no case wrap.
   */
  const goToDestination = (id: PrintDestinationId | null) => {
    setDestinationId(id);
    setSelectedPresetId(null);
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
        <h2 id="cookbook-ready-title">
          {justPurchased ? "Your cookbook is ready 🎉" : "Print your cookbook"}
        </h2>
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

      {destination === null ? (
        /* Step one. The only question that has to come first. */
        <div className="cookbook-ready__destinations">
          <p className="cookbook-ready__lead">Where are you printing this?</p>
          {PRINT_DESTINATIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="cookbook-destination"
              onClick={() => goToDestination(option.id)}
            >
              <DestinationMark id={option.id} name={option.name} />
              <span className="cookbook-destination__text">
                <strong>{option.name}</strong>
                <small>{option.tagline}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="cookbook-ready__formats">
          <button
            type="button"
            className="cookbook-ready__back"
            disabled={exportingPreset !== null}
            onClick={() => goToDestination(null)}
          >
            ‹ {destination.name}
          </button>

          {lastExport ? (
            /* Step two, done. A finished PDF is only half of it: the file is
               correct against exactly one set of order options, and none of
               them are visible by opening it. So they are stated here, at the
               moment they are about to be used. */
            <ExportedNext
              destination={destination}
              lastExport={lastExport}
              printer={destinationPrinter(destination)}
              onPrinterClick={onPrinterClick}
              onExportAnother={onExportAnother}
            />
          ) : (
            <ChooseBook
              destination={destination}
              selectedPresetId={selectedPresetId}
              onSelectPreset={setSelectedPresetId}
              coverSizes={coverSizes}
              setCoverField={setCoverField}
              pageCount={pageCount}
              exportingPreset={exportingPreset}
              onExport={onExport}
            />
          )}
        </div>
      )}

    </Dialog>
  );
}

/**
 * The tile at the head of a destination row.
 *
 * Two kinds, on purpose. The generic rows — your own printer, a copy shop,
 * somewhere else — are ideas, so they get a drawn glyph in our own icon
 * language. Lulu and Blurb are companies, and at this size a company is
 * recognised by its mark rather than by a picture of a book, so they get a
 * monogram standing in for one.
 *
 * A stand-in and not a drawing of their logo: an approximated trademark is
 * worse than an honest initial, both as design and as a claim. Dropping the
 * real marks in is a two-line change once we have the files — greyscale PNGs
 * in public/images, the same nominative treatment `PaprikaLogoIcon` gets.
 */
function DestinationMark({ id, name }: { id: PrintDestinationId; name: string }) {
  const glyph =
    id === "home" ? (
      <PrintIcon size={ICON_SIZE.lg} />
    ) : id === "copy-shop" ? (
      <StorefrontIcon size={ICON_SIZE.lg} />
    ) : id === "other" ? (
      <GlobeIcon size={ICON_SIZE.lg} />
    ) : null;
  return (
    <span className="cookbook-destination__mark" aria-hidden>
      {glyph ?? <span className="cookbook-destination__monogram">{name.charAt(0)}</span>}
    </span>
  );
}

/**
 * The open row's controls: which binding, the cover size if one travels
 * separately, and the button.
 *
 * The two bindings are genuinely different files, not a label on the same one.
 * A case-bound book carries a half-inch gutter on the spine edge because the
 * spine swallows it, and its cover wrap is a different sheet entirely — around
 * 19 × 12.75in over boards, against 17.75 × 11.25 printed flat. So it stays a
 * choice rather than something we decide quietly.
 */
function ChooseBook({
  destination,
  selectedPresetId,
  onSelectPreset,
  coverSizes,
  setCoverField,
  pageCount,
  exportingPreset,
  onExport,
}: {
  destination: PrintDestination;
  selectedPresetId: CookbookPresetId | null;
  onSelectPreset: (id: CookbookPresetId) => void;
  coverSizes: Record<string, { w: string; h: string; spine: string }>;
  setCoverField: (presetId: string, field: "w" | "h" | "spine", value: string) => void;
  pageCount: number;
  exportingPreset: CookbookPresetId | null;
  onExport: (presetId: CookbookPresetId, coverSheet?: CoverSheetSpec) => void;
}) {
  const presets = destinationPresets(destination);
  const labels = bindingLabels(presets);
  const preset = presets.find((option) => option.id === selectedPresetId) ?? presets[0];
  const busy = exportingPreset !== null;

  const num = (raw: string, fallback: number) => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const round = (value: number) => String(Number(value.toFixed(3)));
  const size = coverSizes[preset.id] ?? { w: "", h: "", spine: "" };
  // The spine drives the sheet: it is the only part of a cover a print service
  // will not publish a formula for.
  const spineIn = num(size.spine, coverWrapGeometry(preset, pageCount).spineWidthIn);
  const derived = wrapGeometryForSpine(preset, spineIn);
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

  return (
    <>
      {/* No radio for a destination that binds one thing: a group of one is a
          question with no answer to give. */}
      {presets.length > 1 && (
        <div className="cookbook-binding" role="radiogroup" aria-label="Binding">
          {presets.map((option, index) => (
            <label
              key={option.id}
              className={`cookbook-binding__option${option.id === preset.id ? " is-active" : ""}`}
            >
              <input
                type="radio"
                name={`cookbook-binding-${destination.id}`}
                value={option.id}
                checked={option.id === preset.id}
                disabled={busy}
                onChange={() => onSelectPreset(option.id)}
              />
              {labels[index]}
            </label>
          ))}
        </div>
      )}

      {/* Which book this is, stated once for whichever is selected rather than
          repeated beside every option. */}
      <p className="cookbook-binding__trim">
        {presets.length > 1 ? preset.trimLabel : `${preset.productName} · ${preset.trimLabel}`}
      </p>

      {/* Only where a cover travels on its own. A copy shop binds the document
          you hand it, so there is no cover sheet to size and nothing to read. */}
      {preset.wrapRequired && (
        <div className="cookbook-cover-size">
          <span className="cookbook-cover-size__label">Cover size</span>
          <span className="cookbook-cover-size__fields">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Spine width in inches"
              value={shown.spine}
              disabled={busy}
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
              disabled={busy}
              onChange={(event) => setCoverField(preset.id, "w", event.target.value)}
            />
            <span aria-hidden>×</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Cover height in inches"
              value={shown.h}
              disabled={busy}
              onChange={(event) => setCoverField(preset.id, "h", event.target.value)}
            />
            <span className="cookbook-cover-size__unit">in</span>
          </span>
          <span className="cookbook-cover-size__hint">
            {destination.unknownSpec
              ? "Copy these from your printer’s upload page."
              : `Only if ${destination.name} states different numbers.`}
          </span>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary cookbook-ready__save"
        disabled={busy}
        onClick={() => onExport(preset.id, preset.wrapRequired ? statedSheet : undefined)}
      >
        {exportingPreset === preset.id ? (
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
  destination,
  lastExport,
  printer,
  onPrinterClick,
  onExportAnother,
}: {
  destination: PrintDestination;
  lastExport: { presetId: CookbookPresetId; files: string[] };
  printer?: PrinterOption;
  onPrinterClick: (printer: string, url: string) => void;
  onExportAnother?: () => void;
}) {
  const preset = getCookbookPreset(lastExport.presetId);
  const roles = exportFileRoles(lastExport.files.length);
  const uploads = destinationUploadsAFile(destination);
  // Only where there is a second binding to go back for. Offering it to a
  // destination that makes one thing sends people to a picker with nothing to
  // pick, which reads as a mistake on our part.
  const hasAnotherFormat = destinationPresets(destination).length > 1;
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
        <p className="cookbook-ready__lead">
          {uploads
            ? `${printer ? printer.name : "Your print service"} will ask for:`
            : "When you print it:"}
        </p>
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
        {onExportAnother && hasAnotherFormat && (
          <button type="button" className="cookbook-next__another" onClick={onExportAnother}>
            Save another format
          </button>
        )}
      </div>
    </>
  );
}
