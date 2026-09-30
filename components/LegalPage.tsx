import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { LegalOutline } from "@/components/LegalOutline";
import { GOVERNING_LAW, LEGAL_CONTACT_EMAIL, LEGAL_POSTAL_ADDRESS } from "@/lib/legal";

// ─────────────────────────────────────────────────────────────────────────
// Shared furniture for the Privacy Policy and Terms of Service.
//
// A legal page is read differently from the rest of the site: people arrive
// looking for one specific paragraph, usually from a link somewhere else, and
// they need to find it fast. So these primitives do two things the marketing
// pages don't — every section carries a stable `id` so a clause can be linked
// to directly, and the contents list at the top is built from those same ids
// rather than hand-maintained beside them.
// ─────────────────────────────────────────────────────────────────────────

export interface LegalSectionSpec {
  id: string;
  title: string;
}

/** Page frame: title, honest last-updated date, and a jump list. */
export function LegalPage({
  title,
  lede,
  lastUpdated,
  sections,
  children,
}: {
  title: string;
  lede: string;
  lastUpdated: { iso: string; display: string };
  sections: LegalSectionSpec[];
  children: React.ReactNode;
}) {
  const list = (
    <ol className="flex flex-col gap-cp-2">
      {sections.map((section, index) => (
        <li key={section.id} className="text-cp-small leading-snug">
          <a
            href={`#${section.id}`}
            className="text-brand-ink hover:underline font-semibold"
          >
            <span className="text-ink-soft font-normal tabular-nums">
              {index + 1}.{" "}
            </span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );
  // The outline sits BESIDE the clauses on a wide screen, sticky, so it is
  // always one click from any section without costing the top of the page.
  // Narrower, it folds into one line above the text: 22 entries stacked up
  // front pushed the first clause below the fold.
  return (
    <PageShell wide>
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,720px)] lg:gap-cp-7">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-cp-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pb-cp-4">
            <h2 className="text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
              On this page
            </h2>
            <div className="mt-cp-3 -ml-cp-3">
              <LegalOutline sections={sections} />
            </div>
          </div>
        </nav>

        <div className="min-w-0">
          <header className="mb-cp-6">
            <h1 className="mt-cp-2 text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">
              {title}
            </h1>
            <p className="mt-cp-4 text-ink-soft text-cp-body-lg leading-relaxed">{lede}</p>
            <p className="mt-cp-4 text-cp-caption text-ink-soft">
              Last updated{" "}
              <time dateTime={lastUpdated.iso} className="font-semibold">
                {lastUpdated.display}
              </time>
            </p>
          </header>

          <details className="card px-cp-4 py-cp-3 lg:hidden">
            <summary className="cursor-pointer text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
              On this page
            </summary>
            <nav aria-label="On this page" className="mt-cp-3">
              {list}
            </nav>
          </details>

          <div className="mt-cp-7 flex flex-col gap-cp-7">{children}</div>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * One numbered clause. `id` has to match the entry in the page's section list —
 * that is what keeps the jump links from pointing at nothing, and it is why the
 * ids are spelled out at the call site rather than derived from the title.
 */
export function LegalSection({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-cp-6">
      <h2
        id={`${id}-heading`}
        className="text-cp-h2 font-extrabold tracking-[-0.02em]"
      >
        <span className="text-ink-soft font-bold tabular-nums">{index}. </span>
        {title}
      </h2>
      <div className="mt-cp-3 flex flex-col gap-cp-3 text-ink-soft text-cp-body leading-relaxed">
        {children}
      </div>
    </section>
  );
}

/** Sub-heading inside a clause, for the sections long enough to need one. */
export function LegalSubheading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-cp-2 text-cp-body font-bold text-ink">{children}</h3>
  );
}

/** Bulleted list. Markers sit in the gutter so wrapped lines stay aligned. */
export function LegalList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-cp-2 pl-5 marker:text-ink-soft">
      {children}
    </ul>
  );
}

/**
 * A pulled-out paragraph for the handful of points someone would be genuinely
 * surprised to discover later — public photo URLs, allergen accuracy, what a
 * purchase does and does not cover. The warm accent rule is the same one the
 * features page uses for its privacy note, so an emphasized block reads the
 * same way everywhere on the site.
 */
export function LegalCallout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-cp-5 border-l-2 border-l-[var(--cp-accent-warm)]">
      <p className="text-cp-body font-bold text-ink">{title}</p>
      <div className="mt-cp-2 flex flex-col gap-cp-2 text-ink-soft text-cp-body leading-relaxed">
        {children}
      </div>
    </div>
  );
}

/** Outbound link, styled once so every policy URL in the documents matches. */
export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-ink hover:underline font-semibold"
    >
      {children}
    </a>
  );
}

/** Internal link. Separate from LegalLink so it routes rather than reloads. */
export function LegalInternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-brand-ink hover:underline font-semibold">
      {children}
    </Link>
  );
}

/** Mailto for the contact address, so it is spelled the same way throughout. */
export function LegalContactLink() {
  return (
    <a
      href={`mailto:${LEGAL_CONTACT_EMAIL}`}
      className="text-brand-ink hover:underline font-semibold"
    >
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

/**
 * The closing contact block, identical on both documents. The postal address
 * appears only if there is one to publish — see `LEGAL_POSTAL_ADDRESS`.
 */
export function LegalContactDetails({ entity }: { entity: string }) {
  return (
    <>
      <p>
        Questions and requests can be sent to <LegalContactLink />. We aim to
        respond within a few business days, and always within any deadline the
        law sets for the type of request.
      </p>
      {LEGAL_POSTAL_ADDRESS ? (
        <p>
          {entity}
          <br />
          {LEGAL_POSTAL_ADDRESS}
        </p>
      ) : (
        <p>
          {entity} operates from {GOVERNING_LAW.state}, United States. A postal
          address for formal notices is available on request at the address
          above.
        </p>
      )}
    </>
  );
}
