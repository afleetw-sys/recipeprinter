import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyFirebaseIdToken, type KeyResolver } from "./firebaseIdToken";

const PROJECT = "demo-project";
const NOW = 1_800_000_000;

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sign(
  claims: Record<string, unknown>,
  { key = pair.privateKey, header = {} }: { key?: KeyObject; header?: Record<string, unknown> } = {},
) {
  const head = b64({ alg: "RS256", kid: "k1", typ: "JWT", ...header });
  const body = b64({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "user-1",
    iat: NOW - 60,
    exp: NOW + 3600,
    ...claims,
  });
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key).toString("base64url");
  return `${head}.${body}.${signature}`;
}

const resolveKey: KeyResolver = async (kid) => (kid === "k1" ? pair.publicKey : null);
const check = (token: string) =>
  verifyFirebaseIdToken(token, PROJECT, { resolveKey, nowSeconds: NOW });

describe("verifyFirebaseIdToken", () => {
  it("accepts a well-formed, current token and returns its uid", async () => {
    expect(await check(sign({}))).toEqual({ ok: true, uid: "user-1" });
  });

  it("rejects an expired token", async () => {
    expect(await check(sign({ exp: NOW - 1 }))).toMatchObject({ ok: false, kind: "rejected" });
  });

  it("rejects a token signed by somebody else's key", async () => {
    expect(await check(sign({}, { key: other.privateKey }))).toMatchObject({
      ok: false,
      kind: "rejected",
      reason: "bad signature",
    });
  });

  it("rejects a token for a different project", async () => {
    expect(await check(sign({ aud: "someone-else" }))).toMatchObject({ kind: "rejected" });
    expect(
      await check(sign({ iss: "https://securetoken.google.com/someone-else" })),
    ).toMatchObject({ kind: "rejected" });
  });

  it("rejects a token whose body was altered after signing", async () => {
    const [head, , signature] = sign({}).split(".");
    const forged = `${head}.${b64({ sub: "admin", aud: PROJECT, exp: NOW + 3600, iat: NOW })}.${signature}`;
    expect(await check(forged)).toMatchObject({ kind: "rejected" });
  });

  it("rejects an unsigned (alg none) token and plain junk", async () => {
    expect(await check(sign({}, { header: { alg: "none" } }))).toMatchObject({ kind: "rejected" });
    expect(await check("not-a-token")).toMatchObject({ kind: "rejected" });
  });

  it("rejects a key id Google does not publish", async () => {
    expect(await check(sign({}, { header: { kid: "nope" } }))).toMatchObject({ kind: "rejected" });
  });

  it("calls a certificate outage 'unavailable', not 'signed out'", async () => {
    const down: KeyResolver = async () => {
      throw new Error("certificate fetch HTTP 503");
    };
    expect(
      await verifyFirebaseIdToken(sign({}), PROJECT, { resolveKey: down, nowSeconds: NOW }),
    ).toMatchObject({ ok: false, kind: "unavailable" });
  });
});
