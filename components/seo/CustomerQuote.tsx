/**
 * A customer's own words, shown on the cookbook landing pages (every page with
 * `startsCookbook`). Quoted exactly as she wrote it; edit the wording only if
 * she does.
 */
export function CustomerQuote() {
  return (
    <figure className="mx-auto max-w-[54rem] text-center">
      <blockquote className="text-balance text-[clamp(1.3rem,1.05rem+1vw,1.65rem)] font-semibold leading-snug tracking-[-0.01em] text-ink">
        <p>
          &ldquo;I&rsquo;ve been working on making a cookbook in Canva for 10 months, and was able to do it on
          RecipePrinter in less than a week!&rdquo;
        </p>
      </blockquote>
      <figcaption className="mt-cp-4 text-cp-body font-semibold text-ink-soft">Lacey</figcaption>
    </figure>
  );
}
