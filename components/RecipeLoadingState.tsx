import { ICON_SIZE, SpinnerIcon } from "@/components/icons";

export function RecipeLoadingState({
  className = "",
  label = "Getting recipe…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={`recipe-loading-state ${className}`.trim()} role="status">
      <SpinnerIcon size={ICON_SIZE.lg} />
      <span>{label}</span>
    </div>
  );
}
