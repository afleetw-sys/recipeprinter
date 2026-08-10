"use client";

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "neutral" | "danger";
    selected?: boolean;
  }
>(function IconButton(
  { className, tone = "neutral", selected = false, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(
        "icon-button",
        tone === "danger" && "icon-button--danger",
        selected && "is-active",
        className,
      )}
      {...props}
    />
  );
});

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={classes("control-checkbox", Boolean(hint) && "control-checkbox--with-hint", className)}>
      <input type="checkbox" {...props} />
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function CheckboxGroup({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={classes("control-checkbox-group", className)}>
      <legend className="control-checkbox-group__label">{label}</legend>
      <div className="control-checkbox-group__items">{children}</div>
    </fieldset>
  );
}

export function SelectTile({
  selected,
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & {
  selected: boolean;
}) {
  return (
    <label className={classes("select-tile", selected && "is-active", className)} {...props}>
      {children}
    </label>
  );
}

export type SegmentedOption<T extends string> = {
  id: T;
  label: ReactNode;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function measure() {
      const active = root!.querySelector<HTMLElement>(".segmented-control__option.is-active");
      if (active && active.offsetWidth > 0) {
        setThumb({ left: active.offsetLeft, width: active.offsetWidth });
      }
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => undefined);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={rootRef} className={classes("segmented-control", className)} role="group" aria-label={label}>
      {thumb && (
        <span
          className="segmented-control__thumb"
          aria-hidden
          style={{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px` }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={classes("segmented-control__option", value === option.id && "is-active")}
          aria-pressed={value === option.id}
          onClick={() => value !== option.id && onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
