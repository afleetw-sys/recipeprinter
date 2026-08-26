/**
 * The direct answer, in bold, then the rest.
 *
 * Answers are authored with the answer first, so bolding the front of one lets
 * someone skim the FAQ and come away with the answers rather than the
 * explanations. A bare "Yes." or "No." is not an answer on its own, so a lead
 * of three words or fewer takes the sentence after it too: what gets bolded is
 * "No. RecipePrinter runs in your browser, so there's nothing to download."
 *
 * Derived at render time rather than stored as markup, because the same string
 * feeds the FAQPage structured data, which wants plain text.
 */
export function FaqAnswer({ answer, lead: given }: { answer: string; lead?: string }) {
  // An explicit lead wins: some answers finish answering mid-sentence.
  if (given && answer.startsWith(given)) {
    return (
      <>
        <strong className="font-bold text-ink">{given}</strong>
        {answer.slice(given.length)}
      </>
    );
  }

  const sentences = answer.match(/[^.!?]+[.!?]+\s*/g);
  if (!sentences || sentences.length < 2) return <>{answer}</>;

  let lead = sentences[0];
  if (lead.trim().split(/\s+/).length <= 3) lead += sentences[1];

  const rest = answer.slice(lead.length);
  if (!rest) return <>{answer}</>;
  return (
    <>
      <strong className="font-bold text-ink">{lead.trimEnd()}</strong>{" "}
      {rest}
    </>
  );
}

