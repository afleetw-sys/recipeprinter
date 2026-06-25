import { NextRequest, NextResponse } from "next/server";
import type { ParseResponse } from "@/types/recipe";

// Set in .env.local — the CookPilot Cloud Function endpoint.
// RecipePrinter does NOT contain its own parser; this is the single source of truth.
const PARSER_URL = process.env.COOKPILOT_PARSER_URL;

export async function POST(req: NextRequest) {
  if (!PARSER_URL) {
    return NextResponse.json(
      { success: false, error: "Parser endpoint not configured. Set COOKPILOT_PARSER_URL in .env.local." },
      { status: 503 }
    );
  }

  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ success: false, error: "url is required." }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid URL." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(PARSER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    console.error("Parser fetch failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not reach the recipe parser. Please try again." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    console.error(`Parser returned ${upstream.status}:`, body);
    return NextResponse.json(
      { success: false, error: "The recipe parser returned an error. Please try a different URL." },
      { status: 502 }
    );
  }

  const data: ParseResponse = await upstream.json();
  return NextResponse.json(data);
}
