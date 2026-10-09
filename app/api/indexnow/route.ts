import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import sitemap from "@/app/sitemap";
import { PREVIOUS_SITEMAP } from "@/lib/indexNowBaseline.generated";
import { changedUrls, submitToIndexNow } from "@/lib/server/indexNow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submits this deploy's changed public pages to IndexNow.
 *
 * Called once per production deploy by .github/workflows/indexnow.yml, after
 * Vercel reports the deploy live. "Changed" means new to the sitemap, or a
 * moved <lastmod>, against the sitemap that was live when this deploy was
 * built (lib/indexNowBaseline.generated.ts). Bumping a landing page's
 * `contentUpdated` is therefore what publishes it here too.
 *
 * `{"all": true}` submits every sitemap URL, for a first run or a manual nudge.
 */
function authorized(request: Request): boolean {
  const secret = process.env.INDEXNOW_SUBMIT_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ skipped: "not production" });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { all?: boolean };
  const entries = sitemap();

  let urls: string[];
  if (body.all) urls = entries.map((entry) => entry.url);
  else if (PREVIOUS_SITEMAP) urls = changedUrls(PREVIOUS_SITEMAP, entries);
  else return NextResponse.json({ skipped: "no baseline captured for this build" });

  try {
    const result = await submitToIndexNow(urls);
    return NextResponse.json(result, { status: "ok" in result && !result.ok ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
