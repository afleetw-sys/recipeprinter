type AnyRecord = Record<string, unknown>;

type ImageCandidate = {
  url: string;
  area: number;
  score: number;
  order: number;
};

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
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
      width: asNumber(params.get("w")) ?? asNumber(params.get("width")),
      height: asNumber(params.get("h")) ?? asNumber(params.get("height")),
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
    const width = asNumber(node.width) ?? asNumber(node.imageWidth);
    const height = asNumber(node.height) ?? asNumber(node.imageHeight);
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
