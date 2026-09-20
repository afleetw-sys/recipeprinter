import { describe, expect, it } from "vitest";
import { isBlockedAddress, parseIPv6 } from "@/lib/server/publicAddress";

describe("isBlockedAddress: IPv4", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "192.0.0.8",
    "192.0.2.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "172.15.255.255", "100.63.255.255", "192.0.1.1"])(
    "allows %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("isBlockedAddress: IPv6", () => {
  // Each of these got through the prefix list this replaced. The mapped ones are
  // the canonical spelling a resolver hands back for an AAAA record.
  it.each([
    ["metadata address, mapped, hex form", "::ffff:a9fe:a9fe"],
    ["metadata address, mapped, dotted form", "::ffff:169.254.169.254"],
    ["loopback, mapped, hex form", "::ffff:7f00:1"],
    ["private 172.16, mapped, hex form", "::ffff:ac10:1"],
    ["private 172.16, mapped, dotted form", "::ffff:172.16.0.1"],
    ["private 192.168, mapped, hex form", "::ffff:c0a8:1"],
    ["private 10, mapped, hex form", "::ffff:a00:1"],
    ["link-local past fe80", "febf::1"],
    ["IPv4-compatible metadata address", "::a9fe:a9fe"],
    ["NAT64 metadata address", "64:ff9b::a9fe:a9fe"],
    ["6to4 wrapping loopback", "2002:7f00:1::1"],
    ["6to4 wrapping the metadata address", "2002:a9fe:a9fe::1"],
  ])("blocks %s (%s)", (_name, address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "2001:db8::1",
    "2001::1",
    "3fff::1",
    "fe80::1%eth0",
  ])("still blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
    "2001:4860:4860::8888",
    "2002:808:808::1",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
  ])("allows the public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("isBlockedAddress: not an address", () => {
  it.each(["", "example.com", "localhost", "[::1]", "1.2.3", "::g", "1:2:3:4:5:6:7:8:9"])(
    "blocks %j rather than guessing",
    (value) => {
      expect(isBlockedAddress(value)).toBe(true);
    },
  );
});

describe("parseIPv6", () => {
  it("expands a compressed address to eight groups", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6("1::")).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6("2001:db8::ff00:42:8329")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329]);
  });

  it("reads a dotted IPv4 tail as its two groups", () => {
    expect(parseIPv6("::ffff:169.254.169.254")).toEqual([0, 0, 0, 0, 0, 0xffff, 0xa9fe, 0xa9fe]);
  });

  it("ignores a zone id", () => {
    expect(parseIPv6("fe80::1%en0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("refuses malformed input", () => {
    expect(parseIPv6("1::2::3")).toBeNull();
    expect(parseIPv6("1:2:3:4:5:6:7:8::")).toBeNull();
    expect(parseIPv6("1:2:3")).toBeNull();
    expect(parseIPv6("::ffff:1.2.3.999")).toBeNull();
    expect(parseIPv6("12345::1")).toBeNull();
  });
});
