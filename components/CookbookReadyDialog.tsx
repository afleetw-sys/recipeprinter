"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/components/Dialog";
import { MenuSelect } from "@/components/MenuSelect";
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
  NO_BOOK_CHOICE,
  PHOTOS_HELP,
  PRINT_DESTINATIONS,
  choiceForPreset,
  destinationNote,
  destinationPresets,
  destinationPrinter as printerFor,
  destinationSettings,
  downloadSummary,
  effectiveDestination,
  exportFileRoles,
  getPrintDestination,
  presetForChoice,
  settingsIntro,
  type BookChoice,
  type BookPhotos,
  type BookSize,
  type PrintDestination,
  type PrintDestinationId,
} from "@/lib/printDestinations";
import type { CoverSheetSpec } from "@/types/export";
import type { CookbookPresetId } from "@/types/recipe";

/**
 * One small panel: how it will be bound, and the one follow-up that binding
 * needs.
 *
 * The follow-up depends on the binding and only exists for it. A hardcover has
 * a size; a spiral, comb or 3-ring book is US Letter and has one question about
 * the photos. Nothing else is asked, and nothing is explained until it is
 * selected.
 *
 * Where it is going is optional and deliberately quiet: a small "fill in for"
 * menu that answers everything at once for a place we know. It is a shortcut,
 * not a step, so nothing waits on it and every answer stays open to change
 * whether or not it was used.
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
  // Both optional: somebody can say how it is bound without saying where it goes.
  const [destinationId, setDestinationId] = useState<PrintDestinationId | null>(null);
  const [choice, setChoice] = useState<BookChoice>(NO_BOOK_CHOICE);
  useEffect(() => {
    if (!open) {
      setDestinationId(null);
      setChoice(NO_BOOK_CHOICE);
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
   * Picking a destination answers every question with the book it is set up
   * for. That is a starting point, not a lock: each answer stays open.
   */
  const chooseDestination = (id: PrintDestinationId | null) => {
    setDestinationId(id);
    // Clearing it leaves the answers as they are: it was only ever a shortcut.
    if (id) setChoice(choiceForPreset(destinationPresets(getPrintDestination(id))[0]));
    onExportAnother?.();
  };
  const changeChoice = (patch: Partial<BookChoice>) => {
    setChoice((current) => ({ ...current, ...patch }));
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
            choice={choice}
            onChangeChoice={changeChoice}
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

/** A single-select row of pills, driven by native radios so the arrow keys and
    screen readers get the group they expect. */
function Pills({
  label,
  name,
  options,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  selected: string | null;
  onSelect: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="cookbook-binding" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className={`cookbook-binding__option${option.value === selected ? " is-active" : ""}`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === selected}
            disabled={disabled}
            onChange={() => onSelect(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/**
 * The controls: where it is going, how it will be bound, the one follow-up that
 * binding needs, the cover size if one travels separately, and the button.
 *
 * The answers name genuinely different files, not labels on the same one: a
 * hardcover carries a half-inch inset on the bound edge because the spine
 * swallows it, and its cover wrap is a different sheet entirely, around
 * 19 × 12.75in over boards against 17.75 × 11.25 printed flat.
 */
function ChooseBook({
  destination,
  onChooseDestination,
  choice,
  onChangeChoice,
  coverSizes,
  setCoverField,
  pageCount,
  exportingPreset,
  onExport,
  onPrinterClick,
}: {
  destination: PrintDestination | null;
  onChooseDestination: (id: PrintDestinationId | null) => void;
  choice: BookChoice;
  onChangeChoice: (patch: Partial<BookChoice>) => void;
  coverSizes: Record<string, { w: string; h: string; spine: string }>;
  setCoverField: (presetId: string, field: "w" | "h" | "spine", value: string) => void;
  pageCount: number;
  exportingPreset: CookbookPresetId | null;
  onExport: (presetId: CookbookPresetId, coverSheet?: CoverSheetSpec) => void;
  onPrinterClick: (printer: string, url: string) => void;
}) {
  const preset = presetForChoice(choice);
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
      <div className="cookbook-ready__preset">
        <MenuSelect
          label="Fill in for"
          placeholder="Choose a printer"
          clearLabel="None"
          disabled={busy}
          value={destination?.id ?? null}
          options={PRINT_DESTINATIONS.map((option) => ({ value: option.id, label: option.name }))}
          onChange={onChooseDestination}
        />
        {/* Under the menu, where the place it belongs to is. */}
        {printer && (
          <button
            type="button"
            className="cookbook-next__another cookbook-ready__place"
            onClick={() => onPrinterClick(printer.id, printer.url)}
          >
            Open {printer.name}
            <ExternalIcon size={ICON_SIZE.sm} />
          </button>
        )}
      </div>

      <p className="cookbook-ready__lead">How will it be bound?</p>
      <Pills
        label="How it will be bound"
        name="cookbook-kind"
        disabled={busy}
        options={[
          { value: "hardcover", label: "Hardcover" },
          { value: "flat", label: "Spiral, comb or 3-ring" },
        ]}
        selected={choice.kind}
        onSelect={(kind) => onChangeChoice({ kind: kind as BookChoice["kind"] })}
      />

      {choice.kind === "hardcover" && (
        <>
          <p className="cookbook-ready__lead">Size</p>
          <Pills
            label="Size"
            name="cookbook-size"
            disabled={busy}
            options={[
              { value: "8x10", label: "8 × 10 in" },
              { value: "letter", label: "8.5 × 11 in" },
            ]}
            selected={choice.size}
            onSelect={(size) => onChangeChoice({ size: size as BookSize })}
          />
        </>
      )}

      {choice.kind === "flat" && (
        <>
          <p className="cookbook-ready__lead">Photos</p>
          <Pills
            label="Photos"
            name="cookbook-photos"
            disabled={busy}
            options={[
              { value: "standard", label: "Standard" },
              { value: "edge", label: "Edge to edge" },
            ]}
            selected={choice.photos}
            onSelect={(photos) => onChangeChoice({ photos: photos as BookPhotos })}
          />
          {choice.photos && <p className="cookbook-ready__note">{PHOTOS_HELP[choice.photos]}</p>}
        </>
      )}

      {/* What Save will produce, straight under the choices it follows from. */}
      {preset && (
        <p className="cookbook-ready__downloads">
          {downloadSummary(effectiveDestination(destination, preset), preset)}
        </p>
      )}

      {/* Quiet, and only where the choice is not what this destination is set up
          for. Never a block: the cook can save whatever they chose. */}
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
