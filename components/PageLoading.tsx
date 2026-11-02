import { SiteHeader } from "@/components/SiteHeader";
import { ICON_SIZE, SpinnerIcon } from "@/components/icons";

/**
 * What an account page shows the instant it is asked for (a route's
 * `loading.tsx`), while its own code and data load: the same header, title and
 * spinner it opens on. Without it the page you clicked from stayed up until
 * the next one was ready, so a tap on Projects or Settings looked ignored.
 */
export function PageLoading({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader sticky chrome="page" />
      <main className="mx-auto w-full max-w-5xl px-cp-4 py-cp-5 sm:px-cp-6 sm:py-cp-7">
        <header className="mb-cp-7">
          <h1 className="text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">{title}</h1>
        </header>
        <div className="recipe-loading-state min-h-48">
          <SpinnerIcon size={ICON_SIZE.lg} />
          <span>Loading…</span>
        </div>
      </main>
    </div>
  );
}
