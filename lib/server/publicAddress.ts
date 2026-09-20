import { isIP } from "node:net";

/**
 * Whether an IP address is somewhere this server must never fetch from.
 *
 * The import route fetches whatever URL a stranger types, so this is the line
 * between "a recipe site" and "our own network". It lives here rather than in
 * the route because a route file can only export handlers, and because a
 * classifier that guards a server is exactly the thing that needs its own tests.
 *
 * IPv6 is an ALLOW-list, not a deny-list. It used to be a handful of string
 * prefixes (`fc`, `fd`, `fe80:`, `::ffff:127.` ...), and that shape has no way
 * to be complete: the same address has many spellings, and a resolver hands back
 * the canonical one. `::ffff:169.254.169.254` came back as `::ffff:a9fe:a9fe`,
 * which no prefix matched, so an AAAA record could point a hostname at the
 * metadata address, or at loopback as `::ffff:7f00:1`. Here the address is parsed
 * into its eight groups and only global unicast (`2000::/3`) is let through, minus
 * the special ranges inside it. Anything that will not parse is blocked.
 */

type Octets = readonly [number, number, number, number];

function parseIPv4(address: string): Octets | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts as unknown as Octets;
}

function isBlockedIPv4Octets([a, b, c]: Octets): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    // 192.0.0.0/24 (IETF protocol assignments) and the three documentation
    // blocks: none of them route, so nothing legitimate lives there.
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** The eight 16-bit groups of an IPv6 address, or null if it does not parse. */
export function parseIPv6(input: string): number[] | null {
  let text = input.split("%")[0].toLowerCase();

  // A dotted IPv4 tail (`::ffff:1.2.3.4`) is two more groups in disguise.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (tail) {
    const octets = parseIPv4(tail);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, -tail.length)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const gap = 8 - head.length - rest.length;
  // `::` stands for at least one group of zeros; without it every group is spelled out.
  if (halves.length === 2 ? gap < 1 : gap !== 0) return null;

  const groups = [...head, ...new Array<string>(halves.length === 2 ? gap : 0).fill("0"), ...rest];
  const values = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return values.length === 8 && !values.some(Number.isNaN) ? values : null;
}

function isBlockedIPv6(address: string): boolean {
  const groups = parseIPv6(address);
  if (!groups) return true;

  // An IPv4 address wearing an IPv6 coat is judged as the IPv4 address it is.
  const embedded = (high: number, low: number) =>
    isBlockedIPv4Octets([high >> 8, high & 0xff, low >> 8, low & 0xff]);
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return embedded(groups[6], groups[7]);
  }

  // Loopback, unspecified, unique-local, link-local, multicast, NAT64, the
  // deprecated IPv4-compatible form: none of them are inside 2000::/3.
  if ((groups[0] & 0xe000) !== 0x2000) return true;

  // 6to4 carries an IPv4 address in the next two groups.
  if (groups[0] === 0x2002) return embedded(groups[1], groups[2]);
  // 2001:0000::/23 is protocol assignments (Teredo among them); 2001:db8::/32
  // and 3fff::/20 are documentation. None are anyone's recipe site.
  if (groups[0] === 0x2001 && groups[1] < 0x0200) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) return true;

  return false;
}

/** True for anything that is not a public, routable address. Unparseable input counts as blocked. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = parseIPv4(address);
    return octets ? isBlockedIPv4Octets(octets) : true;
  }
  if (family === 6) return isBlockedIPv6(address);
  return true;
}
