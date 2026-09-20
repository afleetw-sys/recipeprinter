import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

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
