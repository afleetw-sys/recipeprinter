"use client";

import { useRef, useState } from "react";
import { AnchoredMenu } from "@/components/AnchoredMenu";
import { ChevronDownIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";
import type { ExportOutput } from "@/types/export";

const FORMATS: { output: ExportOutput; label: string }[] = [
  { output: "pdf", label: "PDF" },
  { output: "png", label: "PNG image" },
  { output: "jpg", label: "JPG image" },
];

/**
 * The arrow on the Print button: the same cards as a file instead of on paper.
 *
 * "Download", not "Save as image", because one of the three is a PDF. Recipe
 * cards only: a cookbook's Print already ends in its own download.
 */
export function PrintDownloadMenu({
  disabled,
  busy,
  onDownload,
  compact = false,
}: {
  disabled: boolean;
  /** A download is being made. */
  busy: boolean;
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
        aria-label="Download"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : <ChevronDownIcon size={ICON_SIZE.md} />}
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="Download" align="end">
          <p className="cp-menu__heading">Download as</p>
          {FORMATS.map(({ output, label }) => (
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
              {label}
            </button>
          ))}
        </AnchoredMenu>
      )}
    </>
  );
}
