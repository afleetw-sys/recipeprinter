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
 * off as a recipe-card import, so "Start my cookbook" never actually started a
 * cookbook. The book opens with its own ways in: Add recipes, chapters, and
 * the empty pages that offer both.
 */
export function CookbookStartButton({ label = "Start your cookbook" }: { label?: string }) {
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

  return (
    <button
      type="button"
      className="btn btn-primary"
      aria-busy={opening || undefined}
      onClick={() => void start()}
    >
      {label}
      {opening ? <SpinnerIcon size={ICON_SIZE.md} /> : <ArrowRightIcon size={ICON_SIZE.md} />}
    </button>
  );
}
