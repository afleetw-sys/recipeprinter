import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", ...props },
  ref,
) {
  return (
    <div className="select-shell">
      <select ref={ref} className={`select-shell__control ${className}`.trim()} {...props} />
      <ChevronDownIcon size={ICON_SIZE.sm} className="select-shell__caret" />
    </div>
  );
});
