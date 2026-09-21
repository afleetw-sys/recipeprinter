import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkIdToken } from "./cookbookAccess";

function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("checkIdToken", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "project");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the uid when Google resolves the token", async () => {
    vi.stubGlobal("fetch", reply(200, { users: [{ localId: "u1" }] }));
    expect(await checkIdToken("t")).toEqual({ ok: true, uid: "u1" });
  });

  it("treats a token Google turns away as rejected", async () => {
    vi.stubGlobal("fetch", reply(400, { error: { message: "TOKEN_EXPIRED" } }));
    expect(await checkIdToken("t")).toMatchObject({ ok: false, kind: "rejected" });
  });

  it("does not call a key or quota problem 'signed out'", async () => {
    vi.stubGlobal("fetch", reply(403, { error: { message: "Requests from referer are blocked." } }));
    expect(await checkIdToken("t")).toMatchObject({ ok: false, kind: "unavailable" });
  });

  it("does not call a network failure 'signed out'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await checkIdToken("t")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});
