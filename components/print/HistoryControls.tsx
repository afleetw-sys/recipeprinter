"use client";

import { useEffect, useState } from "react";
import { ICON_SIZE, RedoIcon, UndoIcon } from "@/components/icons";

/**
 * Undo and redo for the editor (lib/editHistory). The same pair sits in the
 * desktop header beside Save and in the phone's top bar, where the bottom bar
 * has no room to spare.
 *
 * Disabled rather than hidden when there is nothing to step through, so the
 * header doesn't shift the first time something is edited.
 */
export function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  size,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  size: "header" | "compact";
}) {
  // Read after mount: the server render can't know the keyboard.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)), []);
  const undoKeys = isMac ? "⌘Z" : "Ctrl+Z";
  const redoKeys = isMac ? "⇧⌘Z" : "Ctrl+Y";
  const className = `icon-button rp-history-button rp-history-button--${size}`;
  return (
    <span className="rp-history-controls no-print">
      <button
        type="button"
        className={className}
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title={`Undo (${undoKeys})`}
      >
        <UndoIcon size={ICON_SIZE.md} />
      </button>
      <button
        type="button"
        className={className}
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title={`Redo (${redoKeys})`}
      >
        <RedoIcon size={ICON_SIZE.md} />
      </button>
    </span>
  );
}
