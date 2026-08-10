import { ICON_SIZE, SpinnerIcon } from "@/components/icons";

export function RecipeLoadingState({ className = "" }: { className?: string }) {
  return (
    <div className={`recipe-loading-state ${className}`.trim()} role="status">
      <SpinnerIcon size={ICON_SIZE.lg} />
      <span>Getting recipe…</span>
    </div>
  );
}
