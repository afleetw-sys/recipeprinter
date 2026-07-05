import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ICON_SIZE, PrintIcon } from "@/components/icons";

// Layout for the supporting content pages (How it works, Features, FAQ, About).
// A readable single-column article between the shared header and footer; these
// are pages to actually read, not landing pages to skim past.
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader backHref="/" />
      <main className="flex-1 px-cp-6">
        <article className="max-w-[720px] mx-auto pt-cp-6 sm:pt-cp-7 pb-cp-7">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Page header: an eyebrow, the page <h1>, and a short lede. */
export function PageHeader({
  title,
  lede,
}: {
  title: string;
  lede: string;
}) {
  return (
    <header className="mb-cp-7">
      <h1 className="mt-cp-2 text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">
        {title}
      </h1>
      <p className="mt-cp-4 text-ink-soft text-cp-body-lg leading-relaxed">{lede}</p>
    </header>
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
