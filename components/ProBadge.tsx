import { CrownIcon, ICON_SIZE } from "@/components/icons";

interface ProBadgeProps {
  /** "overlay" absolutely positions in the top-right corner of a relatively
   *  positioned parent (a theme tile, a card-size option). "inline" flows in
   *  normal document flow (a dropdown option row, an account-menu line, a
   *  caption). */
  variant?: "overlay" | "inline";
  /** Shows the word "Pro" next to the crown. Inline badges show it by
   *  default (there's room, and the word disambiguates from "owned" checks
   *  and other pills nearby); overlay badges default to crown-only since a
   *  tile corner is tight. */
  label?: boolean;
  className?: string;
}

/**
 * The one consistent "this needs RecipePrinter Pro" indicator, used
 * everywhere a Pro-only control needs marking — themes, card sizes, Add more
 * recipes, and any future gated control. Every one of those stays fully
 * visible and selectable for a Free user (this badge marks it, it never
 * hides or disables it); the badge exists so "requires Pro" always looks and
 * reads the same, rather than each surface inventing its own crown markup.
 *
 * Styled quietly on purpose — the same neutral border/fill/ink treatment as
 * the "owned" checkmark beside it (see `.recipe-template-option__owned` in
 * print.css), not the bright gold pill this used to be. A crown on every
 * other control read as the editor selling itself rather than describing
 * itself; recognizable still matters, loud doesn't.
 */
export function ProBadge({ variant = "overlay", label, className = "" }: ProBadgeProps) {
  const showLabel = label ?? variant === "inline";
  return (
    <span className={`pro-badge pro-badge--${variant} ${className}`.trim()} aria-label="Pro">
      <CrownIcon size={ICON_SIZE.xs} />
      {showLabel && <span className="pro-badge__label">Pro</span>}
    </span>
  );
}
