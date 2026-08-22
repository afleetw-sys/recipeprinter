import { BookIcon } from "@/components/icons";
import { photoGridLayout } from "@/lib/photoGrid";
import type { PrintProject } from "@/types/recipe";

/**
 * A project's face: a collage of its own recipe photos, or a book mark when it
 * has none.
 *
 * Lives here rather than inside the Projects page because the studio's empty
 * state shows the same thing — a shelf of what you already have. Two hand-rolled
 * copies of "what does a saved book look like" would drift the moment either
 * one grew a badge or a hover.
 *
 * `loading="lazy" decoding="async"` on purpose: these are remote recipe photos
 * at their original size, and a library of twenty books is eighty of them.
 * The aspect-ratio box comes from `.project-cover` in the stylesheet, so a slow
 * photo leaves a hole rather than shoving the grid around as it lands.
 */

/** The recipe photos in a project, deduped and in book order. */
export function projectImages(project: PrintProject): string[] {
  const urls = project.sections.flatMap((section) =>
    section.items.map((item) => item.recipe?.image),
  );
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
}

export function ProjectCover({ project }: { project: PrintProject }) {
  const images = projectImages(project).slice(0, 4);
  if (images.length === 0) {
    return (
      <div className="project-cover project-cover--empty" aria-hidden>
        <BookIcon size={28} />
      </div>
    );
  }
  const { columns, firstSpans } = photoGridLayout(images.length);
  return (
    <div
      className="project-cover"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      aria-hidden
    >
      {images.map((url, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url}-${index}`}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className={firstSpans && index === 0 ? "project-cover__img--wide" : undefined}
        />
      ))}
    </div>
  );
}
