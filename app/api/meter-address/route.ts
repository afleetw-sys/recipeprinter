import { NextResponse } from "next/server";
import { callerKey } from "@/lib/server/rateLimit";
import { signMeterAddress } from "@/lib/server/meterAddress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's address as this site sees it, signed for the import meter
 * (see lib/server/meterAddress.ts). Nothing to sign, no content: the meter
 * then works from the address it sees itself, as it always has.
 */
export function GET(request: Request) {
  const secret = process.env.RECIPEPRINTER_PARSER_SECRET?.trim() ?? "";
  const signed = signMeterAddress(callerKey(request), secret, Date.now());
  if (!signed) return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  return NextResponse.json(signed, { headers: { "cache-control": "no-store" } });
}
