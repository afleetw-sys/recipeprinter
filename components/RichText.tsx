import { Fragment } from "react";
import { parseRichText } from "@/lib/richText";

/**
 * A recipe's own text, with its bold and italic runs.
 *
 * Deliberately returns a FRAGMENT of strings and inline elements rather than
 * wrapping anything in a container. The hidden measurement probe renders these
 * same lines to decide where pages break (see `renderIngredientProbeItem` in
 * RecipeCardPrint), so a wrapper here would measure one box and print another
 * — and the probe has to draw the real `<strong>`/`<em>`, not the stripped
 * text, because bold is wider than body and that width is the whole point of
 * measuring.
 *
 * Unformatted text — almost every line in almost every book — returns the
 * string itself, so the common case renders exactly the node it always did.
 */
export function RichText({ text }: { text: string }) {
  const segments = parseRichText(text);
  if (segments.length === 1 && !segments[0].bold && !segments[0].italic) {
    return <>{segments[0].text}</>;
  }
  return (
    <>
      {segments.map((segment, index) => {
        const key = `${index}-${segment.text.slice(0, 8)}`;
        if (segment.bold && segment.italic) {
          return (
            <strong key={key}>
              <em>{segment.text}</em>
            </strong>
          );
        }
        if (segment.bold) return <strong key={key}>{segment.text}</strong>;
        if (segment.italic) return <em key={key}>{segment.text}</em>;
        return <Fragment key={key}>{segment.text}</Fragment>;
      })}
    </>
  );
}
