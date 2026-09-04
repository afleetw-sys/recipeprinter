"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { BoldGlyph, ItalicGlyph } from "@/components/RecipeCardPrint";
import { applyStyleToFocusedField } from "@/lib/richTextField";

/**
 * Bold / italic for the field being edited, showing whether the caret is
 * ALREADY inside one — the way the body/heading pair shows which it is.
 *
 * Its own component purely to contain a re-render. Knowing whether the caret
 * sits in bold means listening to `selectionchange`, which fires on every
 * keystroke as well as every click; subscribing to that from the deck would
 * re-render the deck on every character and undo the whole point of making the
 * field uncontrolled. Here the only thing that re-renders is two buttons.
 *
 * `queryCommandState` is deprecated alongside `execCommand` and, like it, is
 * implemented everywhere and has no replacement. It is also the only thing
 * that agrees with `execCommand` by construction: asking the same engine the
 * same question that the button is about to act on.
 */
export function TextStyleControl() {
  const [state, setState] = useState({ bold: false, italic: false });

  useEffect(() => {
    const read = () => {
      try {
        setState((current) => {
          const bold = document.queryCommandState("bold");
          const italic = document.queryCommandState("italic");
          // Bail out of the render when nothing actually changed, which is the
          // overwhelmingly common case while typing ordinary text.
          if (current.bold === bold && current.italic === italic) return current;
          return { bold, italic };
        });
      } catch {
        // Some engines throw when there is no editable selection at all.
      }
    };
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  const apply = (style: "bold" | "italic") => (event: ReactMouseEvent) => {
    // preventDefault keeps focus in the field, which is the whole mechanism:
    // the browser styles the live selection, and nothing is mirrored into
    // React to do it.
    event.preventDefault();
    if (!applyStyleToFocusedField(style)) return;
    setState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
    });
  };

  return (
    <div className="recipe-page-toolbar__group" role="group" aria-label="Text style">
      <button
        type="button"
        className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${state.bold ? "is-active" : ""}`}
        aria-label="Bold"
        aria-pressed={state.bold}
        title="Bold (⌘B)"
        onMouseDown={apply("bold")}
      >
        <BoldGlyph />
      </button>
      <button
        type="button"
        className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${state.italic ? "is-active" : ""}`}
        aria-label="Italic"
        aria-pressed={state.italic}
        title="Italic (⌘I)"
        onMouseDown={apply("italic")}
      >
        <ItalicGlyph />
      </button>
    </div>
  );
}
