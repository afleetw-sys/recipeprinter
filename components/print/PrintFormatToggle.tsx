"use client";

import type { CustomerInfo } from "@revenuecat/purchases-js";
import { SelectTile } from "@/components/Controls";
import { ProBadge } from "@/components/ProBadge";
import { canUseCardSize } from "@/lib/recipePrinterPurchases";
import { PRINT_CARD_SIZE_OPTIONS } from "@/lib/printTemplates";
import type { PrintCardSize } from "@/types/recipe";

/** A tiny page illustration per format, same idea as the cookbook's
 *  "Photos" style tiles (`components/print/photoStyle.tsx`) — a full page
 *  reads as a tall portrait sheet, a recipe card as a small landscape card,
 *  so the choice is legible without reading the label. A few abstract ghost
 *  lines stand in for the recipe text itself, same device `PhotoStylePreview`
 *  uses, so the mockup reads as "a page with writing on it" rather than a
 *  blank swatch. */
function PrintFormatPreview({ id }: { id: PrintCardSize }) {
  return (
    <span
      className={`print-format-preview ${id === "card-6x4" ? "print-format-preview--card" : ""}`}
      aria-hidden
    >
      <span className="print-format-preview__page">
        <span className="print-format-preview__line" />
        <span className="print-format-preview__line" />
        <span className="print-format-preview__line print-format-preview__line--short" />
      </span>
    </span>
  );
}

/**
 * Full Page / Recipe Card, as a visible two-option toggle rather than a
 * dropdown — reuses `SelectTile` and the illustrated-tile pattern from the
 * cookbook's book-wide Photos control (`components/print/photoStyle.tsx`)
 * so this reads as the same kind of choice, not a new interaction to learn.
 *
 * One instance, used by both the desktop print-setup panel
 * (`PrintSetupControls`) and the mobile toolbar's Size popover
 * (`app/print/page.tsx`) — there is one card-size picker, not two that could
 * drift apart.
 *
 * Every option stays selectable regardless of entitlement — a locked size
 * only ever gets a `ProBadge`, never a disabled state (see the
 * cross-cutting Pro-visibility principle: mark, never hide). This component
 * makes no gating decision of its own; `canUseCardSize` is the
 * single source of truth it reads, unchanged by this being a toggle instead
 * of a dropdown.
 */
export function PrintFormatToggle({
  cardSize,
  setCardSize,
  customerInfo,
}: {
  cardSize: PrintCardSize;
  setCardSize: (size: PrintCardSize) => void;
  customerInfo: CustomerInfo | null;
}) {
  return (
    <div className="print-format-toggle" role="radiogroup" aria-label="Size">
      {PRINT_CARD_SIZE_OPTIONS.map((option) => {
        const selected = cardSize === option.id;
        const locked = !canUseCardSize(customerInfo, option.id);
        return (
          <SelectTile key={option.id} selected={selected} className="print-format-toggle__tile">
            <input
              type="radio"
              name="print-format"
              className="sr-only"
              checked={selected}
              onChange={() => setCardSize(option.id)}
            />
            <PrintFormatPreview id={option.id} />
            <span className="print-format-toggle__text">
              <span className="print-format-toggle__label">
                {option.label}
                {locked && <ProBadge variant="inline" label={false} tooltip="This card size is Pro" />}
              </span>
              <span className="print-format-toggle__detail">{option.detail}</span>
            </span>
          </SelectTile>
        );
      })}
    </div>
  );
}
