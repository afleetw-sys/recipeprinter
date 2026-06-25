import { NextResponse } from "next/server";
import { jsonLdBlocksFromHtml, recipeFromJsonLd } from "@/lib/schemaRecipe";
import { normalizeImportURL } from "@/lib/cookpilot";
import type { ParseResponse } from "@/types/recipe";

export const runtime = "nodejs";

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ success: false, error } satisfies ParseResponse, { status });
}

export async function POST(request: Request) {
  let url: string;

  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return errorResponse("Paste a recipe URL first.");
    }
    url = normalizeImportURL(body.url);
    new URL(url);
  } catch {
    return errorResponse("That doesn't look like a valid URL.");
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return errorResponse(`That page returned HTTP ${response.status}.`, response.status);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return errorResponse("That URL doesn't look like a recipe page.");
    }

    const html = await response.text();
    const recipe = jsonLdBlocksFromHtml(html)
      .map((block) => recipeFromJsonLd(block, url))
      .find(Boolean);

    if (!recipe) {
      return errorResponse("No recipe could be found on that page.", 422);
    }

    return NextResponse.json({ success: true, recipe } satisfies ParseResponse);
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return errorResponse("The recipe page took too long to respond.", 504);
    }
    return errorResponse("We couldn't import a recipe from that URL.", 500);
  }
}
