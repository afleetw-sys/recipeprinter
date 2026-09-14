import { CrownIcon, ICON_SIZE } from "@/components/icons";

interface ProBadgeProps {
  /** "overlay" absolutely positions in the top-right corner of a relatively
   *  positioned parent (a theme tile, a card-size option). "inline" flows in
   *  normal document flow (a dropdown option row, an account-menu line, a
   *  caption). */
  variant?: "overlay" | "inline";
  /** Shows the word "Pro" next to the crown. Inline badges show it by
   *  default (there's room, and the word disambiguates from "owned" checks
   *  and other pills nearby); overlay badges default to icon-only since a
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
 * reads the same, rather than each surface inventing its own markup.
 *
 * A gold crown, on a dark backing plate for the "overlay" variant — sitting
 * on top of a theme thumbnail or card-size preview needs the contrast — and
 * bare (no backing at all) for "inline," which already sits in a plain text
 * row next to its own label.
 */
export function ProBadge({ variant = "overlay", label, className = "" }: ProBadgeProps) {
  const showLabel = label ?? variant === "inline";
  return (
    <span className={`pro-badge pro-badge--${variant} ${className}`.trim()} aria-label="Pro">
      <CrownIcon size={ICON_SIZE.sm} />
      {showLabel && <span className="pro-badge__label">Pro</span>}
    </span>
  );
}
