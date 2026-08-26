import Link from "next/link";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ICON_SIZE, PrintIcon } from "@/components/icons";
import { absoluteUrl, breadcrumbNode } from "@/lib/seo";

/**
 * The article variant of the landing-page system.
 *
 * How it works, Features, FAQ and About are pages people READ, so they keep a
 * reading measure — but everything around that measure is now the same system
 * the sixteen landing pages use: the same outer container, the same section
 * rhythm (80px, opening to 104px once there's room), the same heading scale,
 * the same FAQ treatment and the same closing action. Before this they were a
 * separate 720px shell that shared nothing but the header and footer.
 *
 * `Prose` caps text at the reading measure; `Wide` lets a grid of cards use the
 * full container. That split is the whole difference between this and a landing
 * page.
 */
export function PageShell({
  crumb,
  path,
  children,
}: {
  /** This page's name in the trail. Omitted only where there is no page. */
  crumb?: string;
  /** This page's path, for the BreadcrumbList structured data. */
  path?: string;
  children: React.ReactNode;
}) {
  const trail = crumb ? [{ name: "Home", href: "/" }, { name: crumb, href: path ?? "/" }] : null;
  return (
    <div className="min-h-screen flex flex-col">
      {trail && path && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbNode(trail.map((item) => ({ name: item.name, url: absoluteUrl(item.href) }))),
            ),
          }}
        />
      )}
      <SiteHeader backHref="/" />
      <main className="flex-1 px-cp-6 sm:px-cp-7 lg:px-[40px]">
        <div className="max-w-article mx-auto flex flex-col gap-[64px] pt-cp-5 pb-[96px] lg:gap-[80px]">
          {trail && <Breadcrumb trail={trail} />}
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Body copy at a reading measure, inside the wide shell. */
export function Prose({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`max-w-[680px] ${className}`}>{children}</div>;
}

/** A section that uses the full container: card grids, related links, examples. */
export function Wide({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Page header: the h1 and its lede, at the landing pages' hero scale. */
export function PageHeader({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="-mt-[40px]">
      <h1 className="text-cp-hero-lg font-extrabold leading-[1.04] tracking-[-0.04em]">
        {title}
      </h1>
      <Prose>
        <p className="mt-cp-4 text-cp-body-lg leading-relaxed text-ink-soft">{lede}</p>
      </Prose>
    </header>
  );
}

/** Section heading, matching the landing pages' `SectionHeading`. */
export function SectionHeading({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <h2 id={id} className="text-cp-h2-lg font-extrabold tracking-[-0.03em]">
      {children}
    </h2>
  );
}

/** Shared call-to-action that sends the reader back to the tool. */
export function StartPrintingCta({ label = "Start printing recipes" }: { label?: string }) {
  return (
    <Link href="/" className="btn btn-primary">
      <PrintIcon size={ICON_SIZE.md} />
      {label}
    </Link>
  );
}

/** The closing action, same shape as the landing pages'. */
export function ClosingAction({
  heading = "Start with one recipe",
  label,
}: {
  heading?: string;
  label?: string;
}) {
  return (
    <section className="border-t border-line pt-[48px]" aria-labelledby="closing-heading">
      <SectionHeading id="closing-heading">{heading}</SectionHeading>
      <p className="mt-cp-2 text-ink-soft text-cp-body leading-relaxed">
        Nothing to install and no account needed. Paste a link, upload a photo of a recipe,
        or paste the text.
      </p>
      <div className="mt-cp-4">
        <StartPrintingCta label={label} />
      </div>
    </section>
  );
}
