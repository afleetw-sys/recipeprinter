import { GuidePicker } from "@/components/seo/GuidePicker";
import type { SeoLandingPage } from "@/lib/seoLandingPages";

/**
 * A section's own shelf of guides, sitting under the argument it belongs to.
 *
 * Canva's features page puts the links to individual tools directly beneath the
 * category that just made the case for them, rather than in one pile at the
 * bottom, and that is the arrangement this is for: a reader convinced by the
 * recipe card photograph should not have to scroll past four other sections to
 * reach the recipe card guide.
 *
 * A recessed tone rather than a rule. A hairline under the last card read as
 * one more divider inside the section, so the guides looked like the end of the
 * argument instead of a shelf of pages to go and read. Three percent ink over
 * the page ground says "different thing" without asking for attention.
 */
export function PickerRow({
  label,
  pages,
}: {
  label: string;
  pages: SeoLandingPage[];
}) {
  return (
    <div className="mt-cp-7 rounded-2xl bg-[var(--cp-surface-muted)] p-cp-5 sm:p-cp-6">
      <p className="text-cp-label font-bold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </p>
      <div className="mt-cp-4">
        <GuidePicker pages={pages} />
      </div>
    </div>
  );
}
