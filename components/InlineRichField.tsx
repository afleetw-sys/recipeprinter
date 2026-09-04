"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { nodesToRichText, richTextToHtml } from "@/lib/richText";

/**
 * An inline field that shows bold and italic as bold and italic.
 *
 * UNCONTROLLED on purpose, and this is the performance story rather than a
 * shortcut. The textarea it replaces was controlled: every keystroke set React
 * state, which re-rendered the active card — and the active card is the one
 * carrying the hidden measurement probes. Here the DOM is the source of truth
 * for as long as the field has focus, and React is told nothing until the edit
 * is committed. Typing costs one browser input event and no render at all, so
 * this is strictly less work per keystroke than what it replaces.
 *
 * That is also why the seeded HTML is frozen in a ref. `dangerouslySetInnerHTML`
 * only rewrites when its string changes, so a parent re-render leaves the
 * user's DOM and caret alone — but only as long as the string it is handed
 * never changes underneath them.
 *
 * Selection, caret and undo are the browser's own (`execCommand`). It is a
 * deprecated API that every engine still implements and nothing has replaced;
 * re-implementing bold-a-selection on top of Range would be a large amount of
 * fragile code to do worse.
 */
export function InlineRichField({
  value,
  className,
  ariaLabel,
  caret,
  onCommit,
  onCancel,
  onSplit,
}: {
  /** Marker text. Read ONCE — see the ref below. */
  value: string;
  className?: string;
  ariaLabel: string;
  /** Where to put the caret, as an offset into the plain text. */
  caret?: number | null;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** Enter splits the line here, for ingredients and steps. Absent = Enter
      finishes the edit, which is what the single-value fields want. */
  onSplit?: (before: string, after: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const initialHtml = useRef(richTextToHtml(value));
  // Escape must not let the blur that follows it commit the abandoned text.
  const cancelled = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      // `<b>`/`<i>` rather than `<span style>`: the serializer reads tags, and
      // this is the browser-level switch that decides which one you get.
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Not fatal — a browser that refuses this still produces tags.
    }
    placeCaret(el, caret ?? plainTextLength(el));
    // Mount only: re-running this would fight the caret on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const read = () => (ref.current ? nodesToRichText(ref.current) : value);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i") {
        event.preventDefault();
        document.execCommand(key === "b" ? "bold" : "italic");
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      onCancel();
      ref.current?.blur();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const el = ref.current;
      if (onSplit && el) {
        onSplit(...splitAtCaret(el));
        return;
      }
      el?.blur();
    }
  };

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      className={className}
      dangerouslySetInnerHTML={{ __html: initialHtml.current }}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (cancelled.current) return;
        onCommit(read());
      }}
      onPaste={(event) => {
        // Plain text only. A paste from a recipe site otherwise arrives as its
        // markup, and everything the serializer cannot read would be dropped
        // silently on the next commit.
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text.replace(/\r\n?/g, "\n"));
      }}
    />
  );
}

/** Text length as the reader counts it, ignoring how it is marked up. */
function plainTextLength(el: HTMLElement): number {
  return el.textContent?.length ?? 0;
}

/** Puts the caret at a plain-text offset, wherever that lands in the tree. */
function placeCaret(el: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  if (!node) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        break;
      }
      remaining -= length;
      const next = walker.nextNode();
      if (!next) {
        range.setStart(node, length);
        break;
      }
      node = next;
    }
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The line either side of the caret, each as marker text — so a split keeps
    the formatting that was on each half. */
function splitAtCaret(el: HTMLElement): [string, string] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return [nodesToRichText(el), ""];
  const caret = selection.getRangeAt(0);

  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(caret.startContainer, caret.startOffset);

  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(caret.endContainer, caret.endOffset);

  // `cloneContents` hands back a fragment, whose `childNodes` is exactly what
  // the serializer walks.
  const asText = (range: Range) =>
    nodesToRichText({ nodeType: 1, nodeName: "DIV", childNodes: range.cloneContents().childNodes });

  return [asText(before), asText(after)];
}
