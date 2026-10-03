import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDownIcon, ExternalIcon, ICON_SIZE } from "@/components/icons";

/**
 * A page's questions, drawn one way everywhere they appear.
 *
 * Up to FAQ_EXPAND_AFTER questions sit open as numbered cards: a handful of
 * answers laid out flat is quick to read. Past that the same cards become
 * native <details>, as /faq always was, because eight or nine open answers is
 * a wall and eight or nine questions is a list you can run your eye down.
 * <details> needs no client component, and the answers stay in the DOM whether
 * or not anyone opens one, so a crawler and a screen reader still read them.
 *
 * The caller is responsible for the FAQPage JSON-LD. Keeping the schema at the
 * page rather than in here means the answers a crawler is given are the answers
 * the page actually renders, chosen in one place.
 */
export const FAQ_EXPAND_AFTER = 5;

export type FaqCardItem = {
  question: string;
  answer: ReactNode;
  /** Chips under the answer, for the questions whose real answer is on
      another page. */
  links?: { href: string; label: string }[];
  /** Anything else under the answer (the /faq page's "Read more" shelf). */
  footer?: ReactNode;
};

/**
 * The chips under an answer. Only a link that leaves the site opens a new tab
 * and says so: the chips began as printer sites (Lulu, Blurb, Staples), and
 * once they all pointed at our own guides, every one still opened a tab and
 * wore the leaving-the-site mark.
 */
function AnswerLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <span className="mt-cp-3 flex flex-wrap gap-cp-2">
      {links.map((link) =>
        /^https?:\/\//.test(link.href) ? (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-compact"
          >
            {link.label}
            <ExternalIcon size={ICON_SIZE.sm} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <Link key={link.href} href={link.href} className="btn btn-secondary btn-compact">
            {link.label}
          </Link>
        ),
      )}
    </span>
  );
}

function AnswerBody({ item }: { item: FaqCardItem }) {
  return (
    <>
      {item.answer}
      {item.links && item.links.length > 0 && <AnswerLinks links={item.links} />}
      {item.footer}
    </>
  );
}

export function FaqCards({
  items,
  expandable = items.length > FAQ_EXPAND_AFTER,
}: {
  items: FaqCardItem[];
  /** Defaults to the length rule above. /faq passes `true`: its groups are
      short, but they sit on one page that is nothing but questions. */
  expandable?: boolean;
}) {
  if (!expandable) {
    return (
      <dl className="grid gap-cp-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <div key={item.question} className="rounded-2xl border border-line bg-card p-cp-5">
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
              <AnswerBody item={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    // Not a <dl>. A definition list cannot have a <details> sitting between its
    // <dt> and <dd>, and the question/answer pairing a crawler needs is carried
    // by the FAQPage node rather than by these tags.
    //
    // `items-start` so a card sizes to its own content: without it, opening one
    // stretches its neighbour to match and leaves a hole under the shorter answer.
    <div className="grid items-start gap-cp-4 sm:grid-cols-2">
      {items.map((item) => (
        <details
          key={item.question}
          // One `name` across the page makes these an exclusive accordion: the
          // browser closes whichever was open when another is opened, with no
          // state to hold and no JavaScript to ship. A browser that does not
          // know the attribute simply lets two stay open.
          name="faq"
          className="rounded-2xl border border-line bg-card p-cp-5"
        >
          <summary
            // The row was a 41px tap target, under the 44 a finger needs.
            // Padding out and margin back grows the hit area into the card's
            // own padding without moving anything on screen.
            className="cp-faq-summary -my-cp-3 flex items-start justify-between gap-cp-4 py-cp-3"
          >
            <h3 className="text-cp-body-lg font-extrabold leading-snug tracking-[-0.02em]">
              {item.question}
            </h3>
            <ChevronDownIcon size={ICON_SIZE.sm} className="cp-disclosure-caret mt-1" aria-hidden />
          </summary>
          <div className="mt-cp-3 text-ink-soft text-cp-body leading-relaxed">
            <AnswerBody item={item} />
          </div>
        </details>
      ))}
    </div>
  );
}
