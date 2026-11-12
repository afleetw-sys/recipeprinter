"use client";

import { useState, type InputHTMLAttributes } from "react";

interface ChapterNameInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onRename: (value: string) => void;
  /** Size the field to its text. */
  autosize?: boolean;
}

/**
 * A chapter's name field that cannot rename the chapter to nothing.
 *
 * A section with no title has no opener page and no header, so saving an empty
 * one on the way to typing a new name made the chapter disappear from under the
 * cursor. The field is free to be empty while it has focus; only a non-empty
 * value is written, and leaving it empty snaps back to the saved name.
 */
export function ChapterNameInput({ value, onRename, onBlur, autosize = false, ...rest }: ChapterNameInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = (
    <input
      {...rest}
      // The default 20-character width would hold the box open past a short
      // name; with `autosize` the hidden copy of the text sets it instead.
      size={autosize ? 1 : rest.size}
      value={draft ?? value}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next.trim()) onRename(next);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
  if (!autosize) return input;
  // As wide as the name, so what follows it (the organizer's recipe count)
  // sits right after the words instead of at the far end of an empty field.
  // The hidden copy of the text sizes the box; the field fills it.
  return (
    <span className="chapter-name-autosize" data-value={(draft ?? value) || rest.placeholder || ""}>
      {input}
    </span>
  );
}
