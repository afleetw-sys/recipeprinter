"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/components/Dialog";
import { MenuSelect } from "@/components/MenuSelect";
import {
  CheckIcon,
  DownloadIcon,
  ExternalIcon,
  ICON_SIZE,
  PrintIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/icons";
import type { PrinterOption } from "@/lib/cookbookPresets";
import { getCookbookPreset } from "@/lib/cookbookPresets";
import type { CookbookPdfProgress, PreparedCookbookPages, PreparedPdfFile } from "@/lib/cookbookPdfExport";
import {
  NO_BOOK_CHOICE,
  PHOTOS_HELP,
  PRINT_DESTINATIONS,
  choiceForPreset,
  destinationPresets,
  destinationPrinter as printerFor,
  downloadSummary,
  getPrintDestination,
  presetForChoice,
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
  exportProgress = "preparing",
  exportError,
  recipeCount = 0,
  exportNeedsAuth = false,
  exportNeedsAccount = false,
  onSignIn,
  lastExport = null,
  awaitingCover = null,
  onDownloadCover,
  onDownloadFile,
  onExportAnother,
}: {
  open: boolean;
  justPurchased: boolean;
  onClose: () => void;
  onExport: (presetId: CookbookPresetId, photoFinish: BookPhotos) => void;
  /** Recipes going into this export. Unlike the preview sheet count, this is
      safe to show while the renderer decides the final pagination. */
  recipeCount?: number;
  onPrinterClick: (printer: string, url: string) => void;
  /** The format currently rendering, if any — the export is a server round trip
      that cold-starts a browser, so it is measured in seconds and has to say so. */
  exportingPreset: CookbookPresetId | null;
  exportProgress?: CookbookPdfProgress;
  exportError: string | null;
  /** The export was refused because there's no account to confirm the purchase
      against — offer the way out rather than just the bad news. */
  exportNeedsAuth?: boolean;
  /** No session at all, so the way forward is making one rather than signing in. */
  exportNeedsAccount?: boolean;
  onSignIn?: () => void;
  /** Files downloaded so far — one entry once the interior lands, two once the
      cover follows. Replaces the controls until the cook asks to save another
      format. */
  lastExport?: { presetId: CookbookPresetId; files: PreparedPdfFile[] } | null;
  /** Set once the interior has downloaded for a wrap-required preset — the
      cover has not been rendered yet. Printers (Lulu included) only state the
      real spine after seeing the interior, so this is also where the cook
      enters that number rather than one we estimated up front. */
  awaitingCover?: PreparedCookbookPages | null;
  onDownloadCover?: (coverSheet?: CoverSheetSpec) => void;
  onDownloadFile?: (file: PreparedPdfFile) => void;
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
      setCoverSizes({});
    }
  }, [open]);

  // Keyed by PRESET: two books do not share an answer, because a wrap quoted
  // for a US Letter book says nothing about an 8 × 10 one.
  //
  // Empty means "the printer has not stated it yet". Held as strings so a half-typed number ("19."
  // on the way to 19.25) is not parsed, rounded and written back under the
  // cursor.
  const [coverSizes, setCoverSizes] = useState<
    Record<string, { w: string; h: string; spine: string }>
  >({});
  const setCoverField = (presetId: string, field: "w" | "h" | "spine", value: string) =>
    setCoverSizes((current) => ({
      ...current,
      [presetId]: {
        ...(current[presetId] ?? { w: "", h: "", spine: "" }),
        [field]: sanitizeDecimal(value),
      },
    }));

  /**
   * Picking a destination answers every question with the book it is set up
   * for. That is a starting point, not a lock: each answer stays open.
   */
  const chooseDestination = (id: PrintDestinationId | null) => {
    setDestinationId(id);
    // Clearing it leaves the answers as they are: it was only ever a shortcut.
    if (id) {
      setChoice({
        ...choiceForPreset(destinationPresets(getPrintDestination(id))[0]),
        photos: "standard",
      });
    }
    onExportAnother?.();
  };
  const changeChoice = (patch: Partial<BookChoice>) => {
    const next = { ...choice, ...patch };
    setChoice(next);
    // The destination was only ever a shortcut that filled in a book to match
    // it — once the cook picks a different one by hand, "Fill in for Lulu"
    // sitting above a file Lulu doesn't take is a stale claim, not a shortcut.
    // Clearing it (rather than leaving the soft warning below to do the work)
    // means the dropdown never disagrees with the book it's next to. Left
    // alone while the choice is still incomplete (`presetForChoice` null) —
    // there's nothing to disagree with yet.
    const nextPreset = presetForChoice(next);
    if (destinationId && nextPreset && !getPrintDestination(destinationId).presetIds.includes(nextPreset.id)) {
      setDestinationId(null);
    }
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
            {exportingPreset
              ? "Creating your cookbook PDF"
              : awaitingCover
                ? "Download your cover next"
                : lastExport
                  ? "Download started"
                  : justPurchased
                    ? "Your cookbook is ready 🎉"
                    : "Print your cookbook"}
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
        {exportingPreset ? (
          <ExportProgress
            presetId={exportingPreset}
            recipeCount={recipeCount}
            progress={exportProgress}
          />
        ) : awaitingCover ? (
          <AwaitingCover
            pages={awaitingCover}
            destination={destination}
            coverSizes={coverSizes}
            setCoverField={setCoverField}
            busy={exportingPreset !== null}
            onDownloadCover={onDownloadCover}
            onDownloadFile={onDownloadFile}
            onExportAnother={onExportAnother}
          />
        ) : lastExport ? (
          /* Done. A prepared PDF is only half of it: the file is correct
             against exactly one set of order options, and none of them are
             visible by opening it. So they are stated here, at the moment they
             are about to be used. */
          <ExportedNext
            destination={destination}
            lastExport={lastExport}
            onPrinterClick={onPrinterClick}
            onExportAnother={onExportAnother}
            onDownloadFile={onDownloadFile}
          />
        ) : (
          <ChooseBook
            destination={destination}
            onChooseDestination={chooseDestination}
            choice={choice}
            onChangeChoice={changeChoice}
            exportingPreset={exportingPreset}
            onExport={onExport}
            onPrinterClick={onPrinterClick}
          />
        )}
      </div>
    </Dialog>
  );
}

/** Keep one positive decimal-shaped value while someone types or pastes a
    dimension. Units, multiplication signs and other copy from the printer's
    requirements block never enter state. */
export function sanitizeDecimal(value: string): string {
  const numeric = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = numeric.split(".");
  return fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
}

function ExportProgress({
  presetId,
  recipeCount,
  progress,
}: {
  presetId: CookbookPresetId;
  recipeCount: number;
  progress: CookbookPdfProgress;
}) {
  const preset = getCookbookPreset(presetId);
  // A cover renders on its own now, as its own later click once the cook has
  // a real spine width from the printer — never in the same request as the
  // interior — so this component only ever sees "rendering-cover" when it is
  // literally the only thing being rendered.
  if (progress === "rendering-cover") {
    return (
      <section className="cookbook-export-progress">
        <ol className="cookbook-export-progress__steps" aria-label="Cover export progress" aria-live="polite">
          <li className="is-current" aria-current="step">
            <span className="cookbook-export-progress__mark" aria-hidden>
              <SpinnerIcon size={ICON_SIZE.sm} />
            </span>
            <span className="cookbook-export-progress__copy">
              <strong>Creating the cover PDF</strong>
              <span className="cookbook-export-progress__activity" role="status">
                Sizing the cover and spine to the finished book.
              </span>
            </span>
          </li>
        </ol>
        <p className="cookbook-export-progress__facts">{preset.trimLabel}</p>
        <p className="cookbook-export-progress__keep-open">Keep this window open. Your download will start automatically.</p>
      </section>
    );
  }

  return <PagesProgress presetId={presetId} recipeCount={recipeCount} />;
}

function PagesProgress({ presetId, recipeCount }: { presetId: CookbookPresetId; recipeCount: number }) {
  const [pageStageIndex, setPageStageIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setPageStageIndex((current) => Math.min(current + 1, PAGE_STAGES.length - 1)),
      7_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const recipes = recipeCount === 1 ? "1 recipe" : `${recipeCount.toLocaleString()} recipes`;
  const preset = getCookbookPreset(presetId);
  const steps = PAGE_STAGES.map((stage) => ({ ...stage, detail: stage.detail(recipes) }));
  const currentIndex = pageStageIndex;

  return (
    <section className="cookbook-export-progress">
      <ol className="cookbook-export-progress__steps" aria-label="Export progress" aria-live="polite">
        {steps.map((item, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "waiting";
          return (
            <li
              key={item.label}
              className={`is-${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="cookbook-export-progress__mark" aria-hidden>
                {state === "done" ? (
                  <CheckIcon size={ICON_SIZE.sm} />
                ) : state === "current" ? (
                  <SpinnerIcon size={ICON_SIZE.sm} />
                ) : (
                  index + 1
                )}
              </span>
              <span className="cookbook-export-progress__copy">
                <strong>{item.label}</strong>
                {state === "current" && (
                  <span
                    key={currentIndex}
                    className="cookbook-export-progress__activity"
                    role="status"
                  >
                    {item.detail}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="cookbook-export-progress__facts">
        {recipes} <span aria-hidden>·</span> {preset.trimLabel}
      </p>
      <p className="cookbook-export-progress__keep-open">Keep this window open. Your download will start automatically.</p>
    </section>
  );
}

const PAGE_STAGES = [
  {
    label: "Laying out your recipes",
    detail: (count: string) => `Building the page layout for ${count}.`,
  },
  {
    label: "Placing photos",
    detail: () => "Fitting recipe photos into their printable spaces.",
  },
  {
    label: "Checking the page order",
    detail: () => "Keeping chapters, facing pages, and blank pages in the right order.",
  },
  {
    label: "Creating the pages PDF",
    detail: () => "Finishing the print-ready file. Large cookbooks can take a little longer.",
  },
] as const;

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
  exportingPreset,
  onExport,
  onPrinterClick,
}: {
  destination: PrintDestination | null;
  onChooseDestination: (id: PrintDestinationId | null) => void;
  choice: BookChoice;
  onChangeChoice: (patch: Partial<BookChoice>) => void;
  exportingPreset: CookbookPresetId | null;
  onExport: (presetId: CookbookPresetId, photoFinish: BookPhotos) => void;
  onPrinterClick: (printer: string, url: string) => void;
}) {
  const preset = presetForChoice(choice, destination ? destinationPresets(destination) : undefined);
  const busy = exportingPreset !== null;
  const printer = destination ? printerFor(destination) : undefined;

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

      {/* What Save will produce, right under the shortcut that answers it —
          not buried down by the button, where it read as a footnote on a
          decision already made three questions ago. */}
      {preset && (
        <p className="cookbook-ready__downloads">
          {downloadSummary(preset)}
        </p>
      )}

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

      {choice.kind && (
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

      <button
        type="button"
        className="btn btn-primary cookbook-ready__save"
        disabled={busy || !preset}
        onClick={() => preset && choice.photos && onExport(preset.id, choice.photos)}
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
  onDownloadFile,
}: {
  destination: PrintDestination | null;
  lastExport: { presetId: CookbookPresetId; files: PreparedPdfFile[] };
  onPrinterClick: (printer: string, url: string) => void;
  onExportAnother?: () => void;
  onDownloadFile?: (file: PreparedPdfFile) => void;
}) {
  const printer: PrinterOption | undefined = chosen ? printerFor(chosen) : undefined;
  const multi = lastExport.files.length > 1;
  return (
    <>
      <ol
        className="cookbook-export-progress__steps cookbook-export-progress__steps--complete"
        aria-label="Completed export"
      >
        {lastExport.files.map((file) => (
          <li key={file.name} className="is-done">
            <span className="cookbook-export-progress__mark" aria-hidden>
              <CheckIcon size={ICON_SIZE.sm} />
            </span>
            <span className="cookbook-export-progress__copy">
              <strong>
                {multi ? `${file.role === "pages" ? "Interior pages" : "Cover"} PDF downloaded` : "PDF downloaded"}
              </strong>
              <span className="cookbook-next__file-name">{file.name}</span>
            </span>
            <button
              type="button"
              className="cookbook-next__download icon-button icon-button--compact icon-button--bare"
              aria-label={`Download ${multi ? (file.role === "pages" ? "interior pages PDF" : "cover PDF") : "PDF"} again`}
              onClick={() => onDownloadFile?.(file)}
            >
              <DownloadIcon size={ICON_SIZE.md} />
            </button>
          </li>
        ))}
      </ol>

      {!multi && (
        <p className="cookbook-ready__lead">Your PDF download has started.</p>
      )}

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
            Choose another format
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Shown right after the interior downloads for a wrap-required preset — the
 * cover comes next, but not from our own estimate. A printer (Lulu included)
 * only states the real spine width after it has seen the interior, so the
 * cover fields live here, after that download, instead of before it the way
 * they used to sit in `ChooseBook`.
 */
function AwaitingCover({
  pages,
  destination,
  coverSizes,
  setCoverField,
  busy,
  onDownloadCover,
  onDownloadFile,
  onExportAnother,
}: {
  pages: PreparedCookbookPages;
  destination: PrintDestination | null;
  coverSizes: Record<string, { w: string; h: string; spine: string }>;
  setCoverField: (presetId: string, field: "w" | "h" | "spine", value: string) => void;
  busy: boolean;
  onDownloadCover?: (coverSheet?: CoverSheetSpec) => void;
  onDownloadFile?: (file: PreparedPdfFile) => void;
  onExportAnother?: () => void;
}) {
  const preset = getCookbookPreset(pages.preset);
  const size = coverSizes[preset.id] ?? { w: "", h: "", spine: "" };
  const positiveNumber = (raw: string) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const widthIn = positiveNumber(size.w);
  const heightIn = positiveNumber(size.h);
  const spineWidthIn = positiveNumber(size.spine);
  const statedSheet = widthIn && heightIn && spineWidthIn
    ? { widthIn, heightIn, spineWidthIn }
    : null;
  // Only claim the shop states its own numbers where it is set up for this
  // format. Anywhere else the numbers come off whatever upload page they use.
  const shopStatesNumbers = Boolean(
    destination && !destination.unknownSpec && destination.presetIds.includes(preset.id),
  );

  return (
    <div className="cookbook-next">
      <ol
        className="cookbook-export-progress__steps cookbook-export-progress__steps--complete"
        aria-label="Interior downloaded"
      >
        <li className="is-done">
          <span className="cookbook-export-progress__mark" aria-hidden>
            <CheckIcon size={ICON_SIZE.sm} />
          </span>
          <span className="cookbook-export-progress__copy">
            <strong>Interior pages PDF downloaded</strong>
            <span className="cookbook-next__file-name">{pages.file.name}</span>
          </span>
          <button
            type="button"
            className="cookbook-next__download icon-button icon-button--compact icon-button--bare"
            aria-label="Download interior pages PDF again"
            onClick={() => onDownloadFile?.(pages.file)}
          >
            <DownloadIcon size={ICON_SIZE.md} />
          </button>
        </li>
      </ol>

      <p className="cookbook-ready__lead">
        {destination?.id === "lulu"
          ? "Upload the interior to Lulu. On the cover step, find REQUIREMENTS and copy Dimensions and Spine Width below."
          : "Upload the interior to your printer. On the cover step, copy its required cover dimensions and spine width below."}
      </p>

      <div className="cookbook-cover-size">
        <span className="cookbook-cover-size__label">Cover size</span>
        <span className="cookbook-cover-size__hint">
          {shopStatesNumbers && destination?.id === "lulu"
            ? "In Lulu: REQUIREMENTS → Dimensions and Spine Width."
            : "Enter the exact numbers shown by your printer."}
        </span>
        {/* Sheet first, spine last: that is the order a print service states
            them in, and reading them back off their page in a different
            order is how a number lands in the wrong box. */}
        <span className="cookbook-cover-size__fields">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Cover width in inches"
            value={size.w}
            disabled={busy}
            onChange={(event) => setCoverField(preset.id, "w", event.target.value)}
          />
          <span aria-hidden>×</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Cover height in inches"
            value={size.h}
            disabled={busy}
            onChange={(event) => setCoverField(preset.id, "h", event.target.value)}
          />
          <span className="cookbook-cover-size__unit" aria-hidden>
            in, spine
          </span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Spine width in inches"
            value={size.spine}
            disabled={busy}
            onChange={(event) => setCoverField(preset.id, "spine", event.target.value)}
          />
          <span className="cookbook-cover-size__unit">in</span>
        </span>
      </div>

      <div className="cookbook-next__actions">
        <button
          type="button"
          className="btn btn-primary btn-compact"
          disabled={busy || !statedSheet}
          onClick={() => statedSheet && onDownloadCover?.(statedSheet)}
        >
          {busy ? (
            <>
              <SpinnerIcon size={ICON_SIZE.md} />
              Preparing…
            </>
          ) : (
            <>
              <PrintIcon size={ICON_SIZE.md} />
              Download cover
            </>
          )}
        </button>
        {onExportAnother && (
          <button type="button" className="cookbook-next__another" onClick={onExportAnother}>
            Choose another format
          </button>
        )}
      </div>
    </div>
  );
}
