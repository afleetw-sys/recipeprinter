import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteUser = vi.fn();
const signOut = vi.fn();
vi.mock("firebase/auth", () => ({
  deleteUser: (...args: unknown[]) => deleteUser(...args),
  signOut: (...args: unknown[]) => signOut(...args),
}));

import { purgeAnonymousUser } from "@/lib/anonymousSession";

const anon = { uid: "anon-1" } as never;
const real = { uid: "real-1" } as never;
const authWith = (currentUser: { uid: string } | null) => ({ currentUser }) as never;

beforeEach(() => {
  deleteUser.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
});

describe("purging the anonymous session", () => {
  it("deletes it when it is still the signed-in user", async () => {
    await purgeAnonymousUser(authWith(anon), anon);
    expect(deleteUser).toHaveBeenCalledWith(anon);
  });

  it("deletes it when nobody is signed in", async () => {
    await purgeAnonymousUser(authWith(null), anon);
    expect(deleteUser).toHaveBeenCalledOnce();
  });

  it("does nothing when a real account is signed in, because deleting signs THEM out", async () => {
    // The SDK's User.delete() ends in auth.signOut(), which signs out whoever is current.
    await purgeAnonymousUser(authWith(real), anon);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs the anonymous user out if the delete fails and it is still the current one", async () => {
    deleteUser.mockRejectedValue(new Error("nope"));
    await purgeAnonymousUser(authWith(anon), anon);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("never signs a real user out after a failed delete", async () => {
    deleteUser.mockRejectedValue(new Error("nope"));
    await purgeAnonymousUser(authWith(null), anon);
    expect(signOut).not.toHaveBeenCalled();
  });
});
