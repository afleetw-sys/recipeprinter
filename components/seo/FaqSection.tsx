/**
 * A page's questions, drawn the way the landing pages draw theirs.
 *
 * The markup lived inline in app/[slug]/page.tsx, so any other page wanting a
 * FAQ had to either copy it or invent a third look. Here so it can be shared;
 * the landing template can move onto it whenever that route is next touched.
 *
 * The caller is responsible for the FAQPage JSON-LD. Keeping the schema at the
 * page rather than in here means the answers a crawler is given are the answers
 * the page actually renders, chosen in one place.
 */
export type FaqItem = { question: string; answer: string };

export function FaqSection({ items }: { items: FaqItem[] }) {
  return (
    <dl className="grid gap-cp-4 sm:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={item.question}
          className="rounded-2xl border border-line bg-card p-cp-5"
        >
          <dt className="flex items-start gap-cp-3 text-cp-body-lg font-extrabold leading-snug tracking-[-0.02em]">
            <span
              className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[var(--cp-accent-warm)] bg-card text-cp-small font-black text-[var(--cp-ink)]"
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="pt-1">{item.question}</span>
          </dt>
          <dd className="mt-cp-3 border-t border-line pt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            {item.answer}
          </dd>
        </div>
      ))}
    </dl>
  );
}
