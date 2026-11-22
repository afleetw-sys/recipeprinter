import { createHmac } from "node:crypto";

/**
 * The address recipeprinter.com sees, signed so the import meter can trust it.
 *
 * Network blocks (`recipePrinterBlockedIps` in CookPilot) are copied from
 * PostHog, which reaches us through this site's `/ingest` proxy. This site has
 * no IPv6 address, so that is always the cook's IPv4 address. Their browser
 * often reaches the meter (a Google callable) over IPv6 instead, an address no
 * block names, so on 2026-11-22 every blocked network was still importing free.
 * Handing the meter this site's view of the caller, signed with the secret it
 * already shares with the parser, lets a block match the address it was copied
 * from.
 *
 * The format is checked by `vouchedSiteAddress` in CookPilot's
 * `functions/src/recipePrinterImportMeter.ts`; change both together.
 */
export const METER_ADDRESS_TTL_MS = 15 * 60 * 1000;

export interface SignedMeterAddress {
  ip: string;
  exp: number;
  sig: string;
}

const IP_PATTERN = /^[0-9A-Fa-f.:]{2,45}$/;

export function signMeterAddress(ip: string, secret: string, nowMs: number): SignedMeterAddress | null {
  if (!secret || !IP_PATTERN.test(ip)) return null;
  const exp = nowMs + METER_ADDRESS_TTL_MS;
  const sig = createHmac("sha256", secret).update(`rp-meter-address|${ip}|${exp}`).digest("base64url");
  return { ip, exp, sig };
}
