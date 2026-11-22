"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { Checkbox } from "@/components/Controls";
import { CheckIcon, ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { PREVIEW_RULE } from "@/components/CookbookWelcomeDialog";
import { useVisitorPrices } from "@/lib/visitorCurrency";
import { FREE_COOKBOOK_RECIPES, IMPORT_ALLOWANCE_LIVE } from "@/lib/freeImports";

/** The cookbook welcome's highlights, as one list (see CookbookWelcomeDialog). */
const HIGHLIGHTS = [
  "Each recipe becomes a real cookbook page, with its photo.",
  "Chapters and a table of contents, done for you.",
  "A cover that's all yours, ready to print at home, a copy shop or as a hardcover.",
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
      open={open}
      onClose={busy ? () => {} : onClose}
      labelledBy="make-cookbook-title"
      className="recipe-add-dialog no-print"
      backdropClassName="recipe-add-dialog__backdrop"
      panelClassName="recipe-add-dialog__panel"
    >
      <div className="recipe-add-dialog__header">
        <h2 id="make-cookbook-title">Make a cookbook from these recipes</h2>
        <button
          type="button"
          className="recipe-add-dialog__close icon-close-btn"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      <div className="recipe-add-dialog__body flex flex-col gap-cp-4">
        <Image
          src="/images/cookbook-onboarding-hero.jpg"
          alt="An open cookbook showing a photo of bourbon chicken beside its recipe page"
          width={1536}
          height={1024}
          className="w-full rounded-xl object-cover"
          style={{ aspectRatio: "16 / 7" }}
        />
        <ul className="flex flex-col gap-cp-2">
          {HIGHLIGHTS.map((line) => (
            <li key={line} className="flex items-start gap-cp-2 text-cp-body text-ink">
              <CheckIcon size={ICON_SIZE.md} className="mt-[2px] flex-shrink-0 text-brand" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="cookbook-tour__price">
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
            {local(price)} <span className="cookbook-tour__per">per cookbook</span>
          </p>
          <p>{discounted ? `20% off your first cookbook with Pro. ${PREVIEW_RULE}` : PREVIEW_RULE}</p>
          {waiting > 0 && (
            <p>
              Your first {FREE_COOKBOOK_RECIPES} recipes go in now. The other {waiting}{" "}
              {waiting === 1 ? "is" : "are"} added when you buy the cookbook.
            </p>
          )}
        </div>
        <Checkbox
          checked={keepInSync}
          onChange={(event) => setKeepInSync(event.target.checked)}
          label="Keep the cards and the cookbook the same"
          hint="Change a recipe in one and it changes in the other."
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="recipe-add-dialog__footer">
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
    </Dialog>
  );
}
