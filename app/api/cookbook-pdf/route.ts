import { NextResponse } from "next/server";

export const runtime = "nodejs";
// A cookbook is dozens of pages and the renderer cold-starts Chromium, so the
// default function timeout is not enough. Vercel caps this by plan; if a very
// large book ever exceeds it the client surfaces the failure rather than
// silently handing back a truncated file.
export const maxDuration = 300;

/**
 * Proxies a cookbook to the PDF renderer.
 *
 * It exists to keep `RECIPEPRINTER_PDF_AUTH` on the server. Calling the render
 * function straight from the browser would mean shipping that shared secret to
 * every visitor, which turns a private endpoint into a public one — anyone
 * could burn 2GiB of Chromium on demand. The browser talks to this route; only
 * this route knows the secret.
 */
export async function POST(request: Request) {
  const endpoint = process.env.RECIPEPRINTER_PDF_URL?.trim();
  const secret = process.env.RECIPEPRINTER_PDF_AUTH?.trim();
  if (!endpoint || !secret) {
    // Not configured is a deployment state, not a user mistake — say so plainly
    // so it can't be mistaken for a broken cookbook.
    return NextResponse.json(
      { error: "PDF export isn't configured on this deployment." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: secret },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("cookbook-pdf: renderer unreachable", error);
    return NextResponse.json(
      { error: "The cookbook renderer didn't respond." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    console.warn("cookbook-pdf: renderer failed", response.status);
    return NextResponse.json(
      { error: "The cookbook couldn't be rendered." },
      { status: 502 },
    );
  }

  // Streamed, not buffered: a book runs to several MB and there is no reason to
  // hold all of it in this function's memory before the download starts.
  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
    },
  });
}
