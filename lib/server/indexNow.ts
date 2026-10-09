import { SITE_URL } from "@/lib/seo";

/**
 * IndexNow: tell Bing, Yandex, Seznam, Naver and friends that a public page
 * changed, instead of waiting for them to recrawl the sitemap. Google ignores
 * IndexNow; the sitemap's honest <lastmod> is what it reads.
 *
 * The key is public by design (search engines fetch it from
 * /indexnow-key.txt to prove we own the host), so it lives in the
 * INDEXNOW_KEY env var rather than in git only to keep it out of forks and
 * previews. What actually needs protecting is the submit route, behind
 * INDEXNOW_SUBMIT_SECRET.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

// 8–128 characters of a-z, A-Z, 0-9 and "-", per the protocol.
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;

// Never submitted, even if one ever slipped into the sitemap: the print and
// export surfaces are noindex, and the rest are per-person or not pages.
const PRIVATE_PREFIXES = ["/print", "/export", "/api", "/projects", "/account", "/__", "/ingest"];

export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && KEY_PATTERN.test(key) ? key : null;
}

/** A canonical, public, indexable page on our own host. */
export function isSubmittableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== SITE_URL || parsed.search || parsed.hash) return false;
  const path = parsed.pathname;
  return !PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * The sitemap URLs that are new, or whose <lastmod> moved, since the previous
 * production deploy. `previous` is that deploy's sitemap as url → lastmod.
 */
export function changedUrls(
  previous: Record<string, string>,
  current: { url: string; lastModified?: string | Date }[],
): string[] {
  return current
    .filter(({ url, lastModified }) => {
      const lastmod = lastModified instanceof Date ? lastModified.toISOString() : String(lastModified ?? "");
      return previous[url] !== lastmod;
    })
    .map(({ url }) => url);
}

export type IndexNowResult =
  | { submitted: string[]; status: number; ok: boolean }
  | { submitted: []; skipped: string };

/** POST the URLs to IndexNow. Filters out anything that isn't a public page. */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = indexNowKey();
  if (!key) return { submitted: [], skipped: "INDEXNOW_KEY is not set" };

  const urlList = Array.from(new Set(urls.filter(isSubmittableUrl))).slice(0, 10_000);
  if (urlList.length === 0) return { submitted: [], skipped: "nothing changed" };

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key,
      keyLocation: `${SITE_URL}${INDEXNOW_KEY_PATH}`,
      urlList,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  // 200 and 202 are both success (202 = key not verified yet, accepted).
  return { submitted: urlList, status: response.status, ok: response.ok };
}
