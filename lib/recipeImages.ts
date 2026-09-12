import { asRecord, asString } from "@/lib/jsonCoerce";

type ImageCandidate = {
  url: string;
  area: number;
  score: number;
  order: number;
};

/**
 * A pixel dimension, from a source that may write it either way.
 *
 * Deliberately NOT `asNumber` from lib/jsonCoerce, and deliberately not named
 * like it: every value this reads is a width or a height off an HTML attribute
 * or a URL query parameter, where "600" and "600px" are both ordinary and a
 * strict number check would throw away most of the sizes on the page. Stripping
 * the non-digits is what makes "600px" and "600w" usable.
 *
 * It used to be a second, looser `asNumber` sitting beside three strict ones in
 * other files. Same name, different rules, no way to tell from a call site
 * which you had — so it says what it measures now instead.
 */
function dimensionPx(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function dimensionsFromUrl(url: string): { width?: number; height?: number } {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    return {
      width: dimensionPx(params.get("w")) ?? dimensionPx(params.get("width")),
      height: dimensionPx(params.get("h")) ?? dimensionPx(params.get("height")),
    };
  } catch {
    return {};
  }
}

function scoreUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (/(?:^|[-_/])thumb(?:nail)?(?:[-_.?/]|$)/.test(lower)) score -= 400_000;
  if (/(?:^|[-_/])small(?:[-_.?/]|$)/.test(lower)) score -= 250_000;
  if (/(?:^|[-_/])medium(?:[-_.?/]|$)/.test(lower)) score -= 80_000;
  if (/(?:^|[-_/])large(?:[-_.?/]|$)/.test(lower)) score += 120_000;
  if (/(?:^|[-_/])original(?:[-_.?/]|$)/.test(lower)) score += 180_000;
  return score;
}

function collectImageCandidates(
  value: unknown,
  out: ImageCandidate[],
  seen: WeakSet<object>,
  depth = 0,
) {
  if (!value || depth > 4) return;

  const direct = asString(value);
  if (direct) {
    const { width, height } = dimensionsFromUrl(direct);
    const area = width && height ? width * height : 0;
    out.push({
      url: direct,
      area,
      score: area + scoreUrl(direct),
      order: out.length,
    });
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectImageCandidates(item, out, seen, depth + 1);
    return;
  }

  const node = asRecord(value);
  if (!node || seen.has(node)) return;
  seen.add(node);

  const url =
    asString(node.url) ??
    asString(node.contentUrl) ??
    asString(node.secure_url) ??
    asString(node.imageURL) ??
    asString(node.imageUrl) ??
    asString(node.src);

  if (url) {
    const width = dimensionPx(node.width) ?? dimensionPx(node.imageWidth);
    const height = dimensionPx(node.height) ?? dimensionPx(node.imageHeight);
    const urlDims = dimensionsFromUrl(url);
    const area = (width ?? urlDims.width ?? 0) * (height ?? urlDims.height ?? 0);
    out.push({
      url,
      area,
      score: area + scoreUrl(url),
      order: out.length,
    });
  }

  for (const key of ["image", "images", "thumbnail", "thumbnailUrl", "imageURL", "imageUrl"]) {
    collectImageCandidates(node[key], out, seen, depth + 1);
  }
}

export function bestRecipeImageFrom(...values: unknown[]): string | undefined {
  const candidates: ImageCandidate[] = [];
  const seen = new WeakSet<object>();
  for (const value of values) collectImageCandidates(value, candidates, seen);

  const unique = new Map<string, ImageCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.score > existing.score) unique.set(candidate.url, candidate);
  }

  return Array.from(unique.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.area !== a.area) return b.area - a.area;
    return a.order - b.order;
  })[0]?.url;
}
