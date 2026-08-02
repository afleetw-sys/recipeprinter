import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";

// `variant` (not `size` — that's a native <select> attribute) picks the field
// height: "compact" is the 38px print-panel dropdown, "default" the 48px field.
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: "default" | "compact";
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", variant = "default", ...props },
  ref,
) {
  const variantClass = variant === "compact" ? "field--compact" : "";
  return (
    <div className="select-shell">
      <select
        ref={ref}
        className={`select-shell__control ${className} ${variantClass}`.trim()}
        {...props}
      />
      <ChevronDownIcon size={ICON_SIZE.sm} className="select-shell__caret" />
    </div>
  );
});
