import { describe, expect, it } from "vitest";
import { normalizeImportURL, undoPastedIntoItself } from "@/lib/cookpilot";
import { JOINED_LINKS_MESSAGE, joinedLinksMessage } from "@/lib/importUrl";

const LINK = "https://www.plainchicken.com/million-dollar-chicken-casserole/";

describe("a link pasted into the middle of itself", () => {
  it("is put back together (the real link a cook pasted)", () => {
    const pasted =
      "https://www.phttps://www.plainchicken.com/million-dollar-chicken-casserole/lainchicken.com/million-dollar-chicken-casserole/";
    expect(undoPastedIntoItself(pasted)).toBe(LINK);
    expect(normalizeImportURL(pasted)).toBe(LINK);
    expect(joinedLinksMessage(pasted)).toBeNull();
  });

  it("is put back together when pasted twice in a row", () => {
    expect(normalizeImportURL(LINK + LINK)).toBe(LINK);
  });

  it("is put back together wherever in the link the cursor was", () => {
    for (let cut = 1; cut < LINK.length; cut += 1) {
      const pasted = LINK.slice(0, cut) + LINK + LINK.slice(cut);
      if (!pasted.slice(1).match(/https?:\/\//)) continue;
      expect(normalizeImportURL(pasted)).toBe(LINK);
    }
  });

  it("leaves an ordinary link exactly as it was", () => {
    expect(normalizeImportURL(LINK)).toBe(LINK);
    expect(normalizeImportURL("plainchicken.com/casserole")).toBe("https://plainchicken.com/casserole");
  });
});

describe("two different links run together", () => {
  it("gets its own message rather than the generic one", () => {
    expect(joinedLinksMessage("https://www.phttps://www.otherblog.com/soup/")).toBe(JOINED_LINKS_MESSAGE);
  });

  it("is not flagged when a second address sits in the path, as archive links do", () => {
    expect(
      joinedLinksMessage("https://web.archive.org/web/2020/https://www.plainchicken.com/casserole/"),
    ).toBeNull();
  });

  it("is not flagged for a single link", () => {
    expect(joinedLinksMessage(LINK)).toBeNull();
    expect(joinedLinksMessage("")).toBeNull();
  });
});
