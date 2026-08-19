import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";

export type Crumb = { name: string; href?: string };

/**
 * Visible breadcrumb trail. The matching BreadcrumbList JSON-LD is emitted in the
 * page's @graph (see `breadcrumbNode` in lib/seo). The last crumb is the current
 * page and is not linked. 2-level (Home › Page) unless the page sits under a hub.
 */
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="no-print">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-cp-caption font-semibold text-ink-soft">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.name} className="flex items-center gap-x-1.5">
              {index > 0 && (
                <ChevronRightIcon size={12} className="text-ink-soft/60" aria-hidden />
              )}
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="hover:text-ink transition-colors">
                  {crumb.name}
                </Link>
              ) : (
                <span className={isLast ? "text-ink" : undefined} aria-current={isLast ? "page" : undefined}>
                  {crumb.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
