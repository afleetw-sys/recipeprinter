import { indexNowKey } from "@/lib/server/indexNow";

// IndexNow's ownership check: the search engine fetches this file and expects
// the key as its whole body. Submissions name it as their keyLocation.
export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
