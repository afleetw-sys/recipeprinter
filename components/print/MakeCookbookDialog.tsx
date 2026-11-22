"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ProDialogArt } from "@/components/ProDialogArt";
import type { ProDialogImage } from "@/lib/proUpgradeCopy";
import { Checkbox } from "@/components/Controls";
import { CheckIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { PREVIEW_RULE } from "@/components/CookbookWelcomeDialog";
import { useVisitorPrices } from "@/lib/visitorCurrency";
import { FREE_COOKBOOK_RECIPES, IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";

/** A printed cookbook's cover (Amelia, 2026-11-22): the thing being made,
    not an open page. The book sits in the middle of the photo, which is what
    stays when the panel crops its sides. */
const ART: ProDialogImage[] = [
  {
    src: "/images/cookbook-cover-wide.jpg",
    alt: "A printed spiral-bound family cookbook with a cover of food photos",
    width: 2176,
    height: 1451,
  },
];

// Three, each one line (Amelia, 2026-11-22: the dialog was too much).
const HIGHLIGHTS = [
  "Each recipe becomes a real cookbook page, with its photo.",
  "Chapters, contents and a cover, done for you.",
  "Print at home, at a copy shop or as a hardcover.",
] as const;

/**
 * "Make a cookbook" from recipe cards (the cards' ⋯ menu).
 *
 * A cook who gets here is already using RecipePrinter, so instead of the
 * four-step cookbook welcome they get its highlights on one screen, with the
 * price, what a free book holds, and the same "keep them the same" choice as
 * "Print as recipe cards" (Amelia, 2026-11-22). The book then opens without
 * the welcome. When there are more cards than a free book holds, it says the
 * rest come in once the book is bought (see `ProjectMeta.fillFromProjectId`).
 */
export function MakeCookbookDialog({
  open,
  onClose,
  recipeCount,
  price,
  fullPrice,
  onMake,
}: {
  open: boolean;
  onClose: () => void;
  /** The cards' recipes, all of which go into the book in the end. */
  recipeCount: number;
  price: string;
  /** The regular price, when `price` is the Pro first-cookbook discount. */
  fullPrice?: string;
  /** Rejects if the book could not be made; the dialog stays open then. */
  onMake: (keepInSync: boolean) => Promise<void>;
}) {
  const { label: local } = useVisitorPrices();
  const [keepInSync, setKeepInSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setKeepInSync(true);
    setBusy(false);
    setError(null);
  }, [open]);

  // Nothing to draw while closed, and the price may not have loaded yet.
  if (!open || !price) return null;
  const discounted = Boolean(fullPrice && fullPrice !== price);
  const waiting = IMPORT_ALLOWANCE_LIVE ? Math.max(0, recipeCount - FREE_COOKBOOK_RECIPES) : 0;

  return (
    <Dialog
      onClose={busy ? () => {} : onClose}
      closeDisabled={busy}
      labelledBy="make-cookbook-title"
      // The Pro dialog's shell, so every dialog with a picture is the same
      // shape: the picture on the left on a computer, none on a phone, the
      // words and the one button on the right. At least 400px tall on a
      // computer, so the picture has room: what it is at the top, and what it
      // costs with the choice and the button as one block at the bottom.
      className="fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[820px] max-h-[92dvh] sm:max-h-[calc(100dvh-48px)] sm:h-auto sm:min-h-[400px] rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-0 flex flex-col sm:flex-row relative overflow-y-auto sm:overflow-hidden"
      portal
    >
      <div className="flex min-w-0 flex-1 flex-col gap-cp-5 p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:overflow-y-auto sm:p-cp-6 sm:justify-between">
        <button
          type="button"
          className="icon-close-btn absolute right-3 top-3 z-10"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>

        {/* Two groups (Amelia, 2026-11-22). Three spread top, middle and bottom
            left the price floating; all of it packed together read as cramped.
            So the one open space sits between what it is and the decision. */}
        <div>
          <h2 id="make-cookbook-title" className="pr-8 text-cp-dialog-title font-extrabold tracking-tight">
            Make a cookbook from these recipes
          </h2>
          <ul className="mt-cp-3 flex flex-col gap-[4px]">
            {HIGHLIGHTS.map((line) => (
              <li key={line} className="flex items-start gap-cp-2 text-cp-small text-ink-soft">
                <CheckIcon size={ICON_SIZE.sm} className="mt-[2px] shrink-0 text-brand" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-cp-4">
          {/* The price in the box it has everywhere else (the cookbook welcome),
              with what a free book holds under it in the same box. */}
          <div className="cookbook-tour__price !mt-0">
            <p className="cookbook-tour__amount">
              {discounted && (
                <>
                  <s className="cookbook-tour__was">
                    <span className="sr-only">Was </span>
                    {local(fullPrice ?? price)}
                  </s>{" "}
                  <span className="sr-only">now </span>
                </>
              )}
              {local(price)}{" "}
              <span className="cookbook-tour__per">{discounted ? "for your first cookbook with Pro" : "per cookbook"}</span>
            </p>
            <p>
              {waiting > 0
                ? `Preview ${FREE_COOKBOOK_RECIPES} free. ${waiting === 1 ? "The last one comes" : `The other ${waiting} come`} in when you buy.`
                : IMPORT_ALLOWANCE_LIVE
                  ? `Preview up to ${FREE_COOKBOOK_RECIPES} recipes free.`
                  : PREVIEW_RULE}
            </p>
          </div>

          <div className="flex flex-col gap-cp-3">
            <Checkbox
              checked={keepInSync}
              onChange={(event) => setKeepInSync(event.target.checked)}
              label="Recipe edits update both the cards and the cookbook"
            />

            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={busy || recipeCount === 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onMake(keepInSync);
                } catch {
                  setError("We couldn't make your cookbook. Please try again.");
                  setBusy(false);
                }
              }}
            >
              {busy && <SpinnerIcon size={ICON_SIZE.md} />}
              Make my cookbook
            </button>
          </div>
        </div>
      </div>
      {/* After the words, so first focus lands there; drawn first on a
          computer, and not at all on a phone, as in the Pro dialog. */}
      <ProDialogArt images={ART} className="hidden sm:order-first sm:block sm:w-[44%] sm:shrink-0" />
    </Dialog>
  );
}
