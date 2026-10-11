"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { ChevronDownIcon, FileTypeIcon, ICON_SIZE, PrintIcon } from "@/components/icons";
import { PRINT_ACTION_LABEL, type PrintPrimaryAction } from "@/lib/printPrimaryAction";
import type { ExportOutput } from "@/types/export";

const FORMATS: readonly ExportOutput[] = ["pdf", "png", "jpg"];

/**
 * The arrow on the Print split button: the other ways to get the cards out.
 *
 * The button's main half is whichever of Print, PDF, PNG and JPG was used last
 * (`primary`); this lists the rest, so the one it replaced is never lost.
 * "Download", not "Save as image", because one of the three is a PDF. Recipe
 * cards only: a cookbook's Print already ends in its own download.
 */
export function PrintDownloadMenu({
  primary,
  disabled,
  onPrint,
  onDownload,
  compact = false,
}: {
  primary: PrintPrimaryAction;
  disabled: boolean;
  onPrint: () => void;
  onDownload: (output: ExportOutput) => void;
  /** The header's smaller button; the phone's bottom bar uses the full one. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`btn btn-primary ${compact ? "btn-compact" : ""}`}
        aria-label="More ways to print or download"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDownIcon size={ICON_SIZE.md} />
      </button>
      {open && (
        <AnchoredMenu
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          label="Print or download"
          align="end"
          // A set width: three short words would otherwise size it to a sliver.
          className="w-44"
        >
          {primary !== "print" && (
            <button
              type="button"
              role="menuitem"
              className="cp-menu__item"
              onClick={() => {
                setOpen(false);
                onPrint();
              }}
            >
              <PrintIcon size={ICON_SIZE.md} />
              Print
            </button>
          )}
          <p className="cp-menu__heading">Download as</p>
          {FORMATS.filter((output) => output !== primary).map((output) => (
            <button
              key={output}
              type="button"
              role="menuitem"
              className="cp-menu__item"
              onClick={() => {
                setOpen(false);
                onDownload(output);
              }}
            >
              <FileTypeIcon label={PRINT_ACTION_LABEL[output]} />
              {PRINT_ACTION_LABEL[output]}
            </button>
          ))}
        </AnchoredMenu>
      )}
    </>
  );
}
