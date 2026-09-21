"use client";

import { useState, type InputHTMLAttributes } from "react";

interface ChapterNameInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onRename: (value: string) => void;
}

/**
 * A chapter's name field that cannot rename the chapter to nothing.
 *
 * A section with no title has no opener page and no header, so saving an empty
 * one on the way to typing a new name made the chapter disappear from under the
 * cursor. The field is free to be empty while it has focus; only a non-empty
 * value is written, and leaving it empty snaps back to the saved name.
 */
export function ChapterNameInput({ value, onRename, onBlur, ...rest }: ChapterNameInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
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
}
