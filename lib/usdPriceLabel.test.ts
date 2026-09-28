import { describe, expect, it } from "vitest";
import { labelUsdPrice } from "@/lib/usdPriceLabel";

describe("labelUsdPrice", () => {
  it("leaves the plain dollar sign for US visitors and US territories", () => {
    expect(labelUsdPrice("$4.99/mo", "US")).toBe("$4.99/mo");
    expect(labelUsdPrice("$19.99", "PR")).toBe("$19.99");
  });

  it("names the currency for everyone else", () => {
    expect(labelUsdPrice("$4.99/mo", "CA")).toBe("US$4.99/mo");
    expect(labelUsdPrice("$39.99/yr", "GB")).toBe("US$39.99/yr");
    expect(labelUsdPrice("$19.99", "AU")).toBe("US$19.99");
  });

  it("keeps the plain dollar sign when the country is unknown", () => {
    expect(labelUsdPrice("$4.99/mo", null)).toBe("$4.99/mo");
  });

  it("only touches a leading dollar sign", () => {
    expect(labelUsdPrice("Your plan", "GB")).toBe("Your plan");
  });
});
