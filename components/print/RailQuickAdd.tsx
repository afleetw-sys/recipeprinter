"use client";

import { useState, type FormEvent } from "react";
import { normalizeImportURL } from "@/lib/cookpilot";
import { ArrowRightIcon, ICON_SIZE } from "@/components/icons";

/**
 * "One more" at the end of the list of things being printed.
 *
 * The rail already says what is in this project, so the place to add to it is
 * the end of that list — the same shape as the box on the home page, in the
 * spot where the next card is about to appear.
 *
 * Why an input and not another button: this is competing with the browser's
 * Back button, and Back is one free universal gesture. A button that opens a
 * dialog is two steps and cannot win that, which is why people were walking
 * home to add a second recipe and finding the queue gone. Paste and press is
 * the only thing that beats it.
 *
 * A link is all this takes. Photos, pasted text and the recipe apps still live
 * behind "Add recipes" at the top of the rail, which is the right home for a
 * source that needs room; a link needs a field.
 */
export function RailQuickAdd({ onAddUrl }: { onAddUrl: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = url.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    try {
      // Through the same normalizer the queue and the parser use, so this can't
      // turn away a URL the pipeline would happily import.
      new URL(normalizeImportURL(trimmed));
    } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }
    setError(null);
    setUrl("");
    onAddUrl(trimmed);
    // Focus stays in the field: adding two links in a row is one paste after
    // another, not a round trip through the page each time.
  }

  return (
    <form className="recipe-page-rail__quick-add" onSubmit={handleSubmit}>
      <div className="recipe-page-rail__quick-add-row">
        <input
          /* `text`, not `url`. The browser's own `type="url"` check demands a
             scheme, so it refuses `allrecipes.com/…` before `normalizeImportURL`
             — which exists to add that scheme — is ever asked. `inputMode` still
             gets the URL keyboard on a phone. */
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          className="field recipe-page-rail__quick-add-field"
          placeholder="Paste another recipe link"
          aria-label="Paste another recipe link"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError(null);
          }}
        />
        <button
          type="submit"
          className="btn btn-neutral btn-compact recipe-page-rail__quick-add-submit"
          disabled={!trimmed}
          aria-label="Add this recipe"
        >
          <ArrowRightIcon size={ICON_SIZE.md} />
        </button>
      </div>
      {error && (
        <p className="field-error recipe-page-rail__quick-add-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
