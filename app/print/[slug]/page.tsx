import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SharedRecipeCardRedirect } from "@/components/SharedRecipeCardRedirect";
import { fetchSharedRecipeCard } from "@/lib/sharedRecipeCards";
import { absoluteUrl, LOGO_PATH, SITE_NAME } from "@/lib/seo";

type PageProps = { params: { slug: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const card = await fetchSharedRecipeCard(params.slug).catch(() => null);
  if (!card) return {};

  const title = card.recipe.title || "Recipe";
  const description = `Print this ${title} recipe card with ${SITE_NAME}.`;
  const path = `/print/${params.slug}`;
  const ogTitle = `${title} · ${SITE_NAME}`;
  const image = card.recipe.image && /^https?:\/\//i.test(card.recipe.image)
    ? card.recipe.image
    : absoluteUrl(LOGO_PATH);

  return {
    title,
    description,
    alternates: { canonical: path },
    // Overrides app/print/layout.tsx's blanket noindex — that default is
    // right for the session-based /print, wrong for a public share link.
    robots: { index: true, follow: true },
    openGraph: { title: ogTitle, description, url: path, images: [image] },
    twitter: { title: ogTitle, description, images: [image] },
  };
}

function NotFoundState() {
  return (
    <div className="h-full flex flex-col">
      <SiteHeader backHref="/" compact sticky />
      <div className="flex-1 flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
        <p className="font-bold text-cp-h2">This recipe link isn&apos;t available</p>
        <p className="text-ink-soft max-w-sm">
          It may have been removed, deactivated, or the link may be incorrect.
        </p>
        <Link href="/" className="btn btn-primary">
          Go to RecipePrinter
        </Link>
      </div>
    </div>
  );
}

export default async function SharedPrintPage({ params }: PageProps) {
  // Reads the recipe exactly as the admin saved it — never re-parses
  // recipe.sourceUrl or hits the importer, so this stays fast and stable even
  // if the original source page changes or disappears.
  const card = await fetchSharedRecipeCard(params.slug).catch(() => null);
  if (!card) return <NotFoundState />;

  return <SharedRecipeCardRedirect card={card} />;
}
