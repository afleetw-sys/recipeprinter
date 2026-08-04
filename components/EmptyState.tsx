import type { ReactNode } from "react";

// Shared empty-state surface: a dashed panel with a heading and optional icon,
// description, and action. Extracted so every "nothing here yet" reads the same
// (same dashed container, heading weight, and spacing) instead of each list
// rebuilding its own box — the queue, the CookPilot picker, and the print deck
// previously each had a slightly different one.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rp-empty-state ${className}`.trim()}>
      {icon ? (
        <div className="rp-empty-state__icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="rp-empty-state__title">{title}</p>
      {description ? <p className="rp-empty-state__desc">{description}</p> : null}
      {action ? <div className="rp-empty-state__action">{action}</div> : null}
    </div>
  );
}
