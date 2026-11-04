"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";
import { useProjectMeta } from "@/lib/project";
import { stashPendingImport } from "@/lib/pendingImport";
import { nextPaint } from "@/lib/nextPaint";
import { track } from "@/lib/analytics";

/**
 * A cookbook page's call to action: one button that opens a new, empty
 * cookbook, the same way the homepage's Cookbook tab does with nothing added.
 *
 * It replaced the import box on these pages. Nobody arrives on "make your own
 * cookbook" holding the one link the box asked for first, and that box handed
 * off as a recipe-card import, so "Start a cookbook" never actually started a
 * cookbook. The book opens with its own ways in: Add recipes, chapters, and
 * the empty pages that offer both.
 */
export function CookbookStartButton({
  label = "Start a cookbook",
  compact = false,
  variant = "button",
}: {
  label?: string;
  /** The site header's control size (`.btn-header`), for the header slot. */
  compact?: boolean;
  /** `link`: words inside a sentence (a page's subtitle), not a button. */
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const { startNewProject } = useProjectMeta();
  const [opening, setOpening] = useState(false);

  async function start() {
    if (opening) return;
    setOpening(true);
    // The `cookbookIntent` carrier /print scaffolds the book from (see
    // PrinterWorkspace's `handoff`).
    startNewProject({ cookbook: true });
    track("recipe_import_submitted", { surface: "capture", source: "manual" });
    await stashPendingImport({ kind: "empty" });
    // One frame so the spinner shows before the navigation takes the thread.
    await nextPaint();
    router.push("/print");
  }

  if (variant === "link") {
    return (
      <button
        type="button"
        className="inline cursor-pointer border-0 bg-transparent p-0 font-semibold text-ink underline underline-offset-[0.16em] hover:text-accent-ink"
        aria-busy={opening || undefined}
        onClick={() => void start()}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-primary${compact ? " btn-header" : ""}`}
      aria-label={compact ? label : undefined}
      aria-busy={opening || undefined}
      onClick={() => void start()}
    >
      {/* In the header on the narrowest phones (under 360px), just "Start":
          the bar also holds the logo, Upgrade and the account. */}
      {compact ? (
        <>
          <span className="max-[359px]:hidden">{label}</span>
          <span className="hidden max-[359px]:inline" aria-hidden>Start</span>
        </>
      ) : (
        label
      )}
      {/* No arrow in the header either: the label only fits on its own. */}
      {opening ? <SpinnerIcon size={ICON_SIZE.md} /> : !compact && <ArrowRightIcon size={ICON_SIZE.md} />}
    </button>
  );
}
