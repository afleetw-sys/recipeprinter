import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrintPass, signPrintPass } from "./printPass";

// The print pass carries a subscriber's Pro into Safari through a link, so the
// link is the only thing standing between anyone and a free Pro print: only a
// pass this server signed, unaltered and unexpired, may be honoured.

const NOW = 1_800_000_000_000;

afterEach(() => vi.unstubAllEnvs());

describe("readPrintPass", () => {
  it("honours only an intact, unexpired pass this server signed", () => {
    vi.stubEnv("RECIPEPRINTER_PDF_AUTH", "server-secret");
    const pass = { ent: ["pro"], exp: NOW + 60_000 };
    const token = signPrintPass(pass);
    expect(readPrintPass(token, NOW)).toEqual(pass);

    const [body, signature] = token.split(".");
    const edited = Buffer.from(JSON.stringify({ ent: ["pro"], exp: NOW + 10 ** 12 })).toString("base64url");
    expect(readPrintPass(`${edited}.${signature}`, NOW), "body edited after signing").toBeNull();
    expect(readPrintPass(`${body}.${signature.slice(0, -2)}xx`, NOW), "signature tampered").toBeNull();
    expect(readPrintPass(body, NOW), "no signature").toBeNull();
    expect(readPrintPass(token, pass.exp), "expired").toBeNull();

    vi.stubEnv("RECIPEPRINTER_PDF_AUTH", "another-secret");
    expect(readPrintPass(token, NOW), "signed with another key").toBeNull();
    vi.stubEnv("RECIPEPRINTER_PDF_AUTH", "");
    expect(readPrintPass(token, NOW), "no key configured").toBeNull();
  });
});
